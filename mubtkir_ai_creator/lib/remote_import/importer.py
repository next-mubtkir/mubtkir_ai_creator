"""Import Engine — core import logic for all import types (Insert/Update/Submit/Cancel/Rename)."""

import json
import time

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib.client import FrappeSiteClient
from mubtkir_ai_creator.lib.remote_import.preview import parse_file


def _decode_error(error_str):
    """Decode Unicode escapes in API error messages to readable Arabic text."""
    try:
        # Try to extract JSON from the error string and decode it
        if '{"exception"' in error_str or '{"exc_type"' in error_str:
            import re
            json_match = re.search(r'\{.*\}', error_str)
            if json_match:
                decoded = json.loads(json_match.group())
                msg = decoded.get("exception") or decoded.get("_server_messages") or str(decoded)
                # _server_messages is often a JSON-encoded list of JSON strings
                if isinstance(msg, str) and msg.startswith("["):
                    try:
                        msgs = json.loads(msg)
                        parts = []
                        for m in msgs:
                            try:
                                parts.append(json.loads(m).get("message", m))
                            except (json.JSONDecodeError, TypeError, AttributeError):
                                parts.append(str(m))
                        return " | ".join(parts)
                    except (json.JSONDecodeError, TypeError):
                        pass
                return str(msg)
        # Try unicode_escape decode for \uXXXX sequences
        if "\\u0" in error_str:
            return error_str.encode("utf-8").decode("unicode_escape")
    except Exception:
        pass
    return error_str


def run_import(import_name, start_row=0):
    """Execute the import operation.

    This is the main entry point — can be called directly or via background job.
    """
    doc = frappe.get_doc("AI Remote Import", import_name)
    client = FrappeSiteClient(doc.client_site)

    # Parse the file
    file_data = parse_file(file_url=doc.source_file)
    headers = file_data["headers"]
    rows = file_data["rows"]

    # Load mapping
    mapping = {}
    if doc.column_mapping:
        mapping = json.loads(doc.column_mapping)
    elif doc.mapping_name:
        map_doc = frappe.get_doc("AI Import Mapping", doc.mapping_name)
        mapping = json.loads(map_doc.mapping_data or "{}")

    if not mapping:
        frappe.throw("Column mapping is not defined")

    # Update total
    doc.db_set("total_rows", len(rows))
    doc.start_import()

    # Calculate batches
    batch_size = doc.batch_size or 200
    total_batches = (len(rows) + batch_size - 1) // batch_size
    doc.db_set("total_batches", total_batches)

    imported = 0
    failed = 0
    skipped = 0
    errors = []

    import_func = _get_import_func(doc.import_type)

    for batch_num in range(total_batches):
        batch_start = batch_num * batch_size + start_row
        batch_end = min(batch_start + batch_size, len(rows))
        batch_rows = rows[batch_start:batch_end]

        if not batch_rows:
            continue

        doc.db_set("current_batch", batch_num + 1)

        batch_success = 0
        batch_fail = 0

        for row_idx, row in enumerate(batch_rows):
            actual_row = batch_start + row_idx + 2  # +2 for header row + 0-index
            try:
                row_data = _build_row_data(headers, row, mapping, doc)

                if not row_data:
                    skipped += 1
                    continue

                import_func(client, doc.remote_doctype, row_data, doc)
                imported += 1
                batch_success += 1
                doc.db_set("last_successful_row", actual_row)

            except Exception as e:
                error_msg = _decode_error(str(e))[:500]
                if doc.skip_failed_rows:
                    failed += 1
                    batch_fail += 1
                    errors.append({"row": actual_row, "error": error_msg})
                else:
                    # Stop import on first error
                    failed += 1
                    errors.append({"row": actual_row, "error": error_msg})
                    doc.db_set("error_log", json.dumps(errors, ensure_ascii=False))
                    doc.update_progress(imported, failed, skipped, batch_num + 1)
                    doc.db_set("is_resumable", 1)
                    doc.finish_import("Failed")
                    _create_import_log(doc, imported, failed, skipped, errors)
                    return {"status": "Failed", "row": actual_row, "error": error_msg}

            # Update progress every 10 rows
            if (row_idx + 1) % 10 == 0:
                doc.update_progress(imported, failed, skipped, batch_num + 1)
                frappe.publish_realtime(
                    "import_progress",
                    {"import_name": import_name, "imported": imported, "failed": failed,
                     "skipped": skipped, "total": len(rows), "batch": batch_num + 1},
                    user=doc.started_by,
                )

        # Update batch row status
        _update_batch_row(doc, batch_num + 1, batch_start + 2, batch_end + 1,
                          batch_success, batch_fail)

        # Commit per batch to avoid long transactions
        frappe.db.commit()

    # Final status
    doc.db_set("error_log", json.dumps(errors[-1000:], ensure_ascii=False) if errors else "[]")
    doc.update_progress(imported, failed, skipped, total_batches)
    frappe.db.commit()  # Ensure progress is persisted before status update

    if failed == 0:
        status = "Success"
    elif imported > 0:
        status = "Partial Success"
    else:
        status = "Failed"

    doc.finish_import(status)
    _create_import_log(doc, imported, failed, skipped, errors)
    frappe.db.commit()  # Final commit

    frappe.publish_realtime(
        "import_complete",
        {"import_name": import_name, "status": status, "imported": imported,
         "failed": failed, "skipped": skipped,
         "total_rows": len(rows), "total_batches": total_batches},
        user=doc.started_by,
    )

    return {"status": status, "imported": imported, "failed": failed, "skipped": skipped}


def _get_import_func(import_type):
    """Return the appropriate import function for the import type."""
    funcs = {
        "Insert": _do_insert,
        "Update": _do_update,
        "Insert if Missing": _do_insert_if_missing,
        "Update if Exists": _do_update_if_exists,
        "Submit": _do_submit,
        "Cancel": _do_cancel,
        "Rename": _do_rename,
    }
    func = funcs.get(import_type)
    if not func:
        frappe.throw(f"Unsupported import type: {import_type}")
    return func


def _build_row_data(headers, row, mapping, import_doc):
    """Build a dict from row data using the column mapping.

    Handles parent fields and child table fields (dot notation: table_field.child_field).
    """
    data = {}
    child_data = {}  # {table_fieldname: {child_field: value}}

    for col_idx, header in enumerate(headers):
        target = mapping.get(header)
        if not target:
            continue

        value = row[col_idx] if col_idx < len(row) else ""

        # Skip empty values if option is set
        if import_doc.ignore_empty_values and (value == "" or value is None):
            continue

        if "." in target:
            # Child table field
            table_fn, child_fn = target.split(".", 1)
            if table_fn not in child_data:
                child_data[table_fn] = {}
            child_data[table_fn][child_fn] = value
        else:
            data[target] = value

    # Merge child data
    for table_fn, child_fields in child_data.items():
        if table_fn not in data:
            data[table_fn] = []
        data[table_fn].append(child_fields)

    # Skip completely empty rows
    real_values = {k: v for k, v in data.items() if v and k != "name"}
    if not real_values:
        return None

    return data


def _do_insert(client, doctype, data, import_doc):
    """Insert a new document."""
    name = data.pop("name", None)
    # Handle attachment fields before insert
    if import_doc.import_attachments:
        data = _process_attachments(data, import_doc.client_site, doctype, None)
    resp = client.create_doc(doctype, data)
    new_name = resp.get("data", {}).get("name")
    # Upload attachments after insert if needed (for Attach fields with local paths)
    if import_doc.import_attachments and new_name:
        _post_insert_attachments(import_doc.client_site, doctype, new_name, data)
    if import_doc.submit_after_import and new_name:
        client.call_method("frappe.client.submit", {"doc": json.dumps({"doctype": doctype, "name": new_name})})


def _do_update(client, doctype, data, import_doc):
    """Update an existing document by name."""
    name = data.pop("name", None)
    if not name:
        raise ValueError("'name' column is required for Update")
    client.update_doc(doctype, name, data)


def _do_insert_if_missing(client, doctype, data, import_doc):
    """Insert only if the document doesn't exist."""
    name = data.get("name")
    if name:
        try:
            client.get_doc(doctype, name)
            return  # Already exists, skip
        except Exception:
            pass  # Doesn't exist, proceed with insert
    data.pop("name", None)
    client.create_doc(doctype, data)


def _do_update_if_exists(client, doctype, data, import_doc):
    """Update only if the document exists, otherwise skip."""
    name = data.pop("name", None)
    if not name:
        raise ValueError("'name' column is required for Update")
    try:
        client.get_doc(doctype, name)
        client.update_doc(doctype, name, data)
    except Exception:
        pass  # Doesn't exist, skip


def _do_submit(client, doctype, data, import_doc):
    """Submit an existing document."""
    name = data.get("name")
    if not name:
        raise ValueError("'name' column is required for Submit")
    client.call_method("frappe.client.submit", {"doc": json.dumps({"doctype": doctype, "name": name})})


def _do_cancel(client, doctype, data, import_doc):
    """Cancel a submitted document."""
    name = data.get("name")
    if not name:
        raise ValueError("'name' column is required for Cancel")
    client.call_method("frappe.client.cancel", {"doctype": doctype, "name": name})


def _do_rename(client, doctype, data, import_doc):
    """Rename a document."""
    old_name = data.get("name")
    new_name = data.get("new_name") or data.get("title")
    if not old_name or not new_name:
        raise ValueError("'name' and 'new_name' are required for Rename")
    client.call_method("frappe.client.rename_doc", {
        "doctype": doctype,
        "old": old_name,
        "new": new_name,
    })


def _update_batch_row(doc, batch_num, start_row, end_row, success, fail):
    """Update or create a batch tracking row."""
    existing = None
    for b in doc.batches or []:
        if b.batch_number == batch_num:
            existing = b
            break

    if existing:
        existing.db_set("status", "Success" if fail == 0 else ("Partial" if success > 0 else "Failed"))
        existing.db_set("success_count", success)
        existing.db_set("fail_count", fail)
    else:
        doc.append("batches", {
            "batch_number": batch_num,
            "start_row": start_row,
            "end_row": end_row,
            "status": "Success" if fail == 0 else ("Partial" if success > 0 else "Failed"),
            "success_count": success,
            "fail_count": fail,
        })
        doc.save(ignore_permissions=True)


def _create_import_log(doc, imported, failed, skipped, errors):
    """Create an AI Import Log record."""
    started = doc.started_on or now_datetime()
    finished = now_datetime()
    duration_secs = 0
    try:
        duration_secs = (finished - started).total_seconds()
    except Exception:
        pass

    avg_speed = round(imported / duration_secs, 2) if duration_secs > 0 else 0

    log = frappe.get_doc({
        "doctype": "AI Import Log",
        "remote_import": doc.name,
        "client_site": doc.client_site,
        "import_user": doc.started_by,
        "remote_doctype": doc.remote_doctype,
        "import_type": doc.import_type,
        "status": doc.status,
        "file_name": doc.source_file_name,
        "mapping_used": doc.mapping_name,
        "source_type": "Excel" if (doc.source_file_name or "").endswith((".xlsx", ".xls")) else "CSV",
        "total_rows": doc.total_rows,
        "imported_rows": imported,
        "failed_rows": failed,
        "skipped_rows": skipped,
        "duration": duration_secs,
        "avg_speed": avg_speed,
        "started_on": started,
        "finished_on": finished,
        "errors": json.dumps(errors[-200:], ensure_ascii=False) if errors else "[]",
    })
    log.insert(ignore_permissions=True)
    frappe.db.commit()
    return log.name


def _process_attachments(data, client_site, doctype, docname):
    """Pre-process attachment fields — convert local references to remote URLs where possible."""
    from mubtkir_ai_creator.lib.remote_import.attachment import process_attachment_column

    # Identify Attach/Attach Image fields by checking for file-like values
    for key, value in list(data.items()):
        if not isinstance(value, str):
            continue
        val = value.strip()
        if val.startswith(("/files/", "/private/files/")) or (
            val and "." in val.rsplit("/", 1)[-1] and not val.startswith("http")
        ):
            # Likely an attachment — process it
            try:
                new_val = process_attachment_column(client_site, doctype, docname or "", val)
                if new_val:
                    data[key] = new_val
            except Exception:
                pass  # Keep original value if upload fails
    return data


def _post_insert_attachments(client_site, doctype, docname, data):
    """Upload local file attachments after document creation (when we have the docname)."""
    from mubtkir_ai_creator.lib.remote_import.attachment import upload_attachment
    import os

    for key, value in data.items():
        if not isinstance(value, str):
            continue
        val = value.strip()
        # If it's still a local path, try uploading now that we have a docname
        if val.startswith(("/files/", "/private/files/")):
            try:
                upload_attachment(client_site, doctype, docname, file_url=val)
            except Exception:
                pass
