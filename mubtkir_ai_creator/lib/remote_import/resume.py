"""Resume Engine — resume interrupted imports, retry failed rows."""

import json

import frappe

from mubtkir_ai_creator.lib.remote_import.importer import run_import
from mubtkir_ai_creator.lib.remote_import.preview import parse_file


def resume_import(import_name):
    """Resume an interrupted import from the last successful row."""
    doc = frappe.get_doc("AI Remote Import", import_name)

    if not doc.is_resumable:
        frappe.throw("This import cannot be resumed")

    if doc.status in ("Running", "Queued"):
        frappe.throw("Import is already running")

    # Calculate the row index to resume from
    last_row = doc.last_successful_row or 0
    start_row = max(0, last_row - 1)  # -1 for header offset

    doc.db_set("status", "Resuming")
    frappe.db.commit()

    if doc.run_as_background_job:
        frappe.enqueue(
            "mubtkir_ai_creator.lib.remote_import.importer.run_import",
            import_name=import_name,
            start_row=start_row,
            queue="long",
            timeout=7200,
            job_id=f"ai_import_resume_{import_name}",
        )
        return {"status": "Queued", "resuming_from_row": start_row + 2}
    else:
        return run_import(import_name, start_row=start_row)


def retry_failed_rows(import_name):
    """Retry only the failed rows from a previous import."""
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status in ("Running", "Queued"):
        frappe.throw("Import is already running")

    errors = []
    if doc.error_log:
        try:
            errors = json.loads(doc.error_log)
        except (json.JSONDecodeError, TypeError):
            frappe.throw("No valid error data to retry")

    if not errors:
        frappe.throw("No failed rows to retry")

    failed_row_nums = {e["row"] for e in errors if isinstance(e, dict) and "row" in e}

    # Parse the original file
    file_data = parse_file(file_url=doc.source_file)
    headers = file_data["headers"]
    all_rows = file_data["rows"]

    # Extract only failed rows (convert from Excel row num to 0-based index)
    retry_rows = []
    for row_num in sorted(failed_row_nums):
        idx = row_num - 2  # -2 for header + 0-index
        if 0 <= idx < len(all_rows):
            retry_rows.append(all_rows[idx])

    if not retry_rows:
        frappe.throw("Failed rows not found in the original file")

    # Create a new import record for the retry
    retry_doc = frappe.get_doc({
        "doctype": "AI Remote Import",
        "client_site": doc.client_site,
        "remote_doctype": doc.remote_doctype,
        "import_type": doc.import_type,
        "source_file": doc.source_file,
        "source_file_name": f"retry_{doc.source_file_name or 'unknown'}",
        "column_mapping": doc.column_mapping,
        "mapping_name": doc.mapping_name,
        "submit_after_import": doc.submit_after_import,
        "skip_failed_rows": doc.skip_failed_rows,
        "send_emails": doc.send_emails,
        "ignore_empty_values": doc.ignore_empty_values,
        "ignore_link_validation": doc.ignore_link_validation,
        "update_child_tables": doc.update_child_tables,
        "import_attachments": doc.import_attachments,
        "run_as_background_job": doc.run_as_background_job,
        "batch_size": doc.batch_size,
    })
    retry_doc.insert(ignore_permissions=True)
    frappe.db.commit()

    # Run the retry (uses the same file but the importer will process it)
    if retry_doc.run_as_background_job:
        frappe.enqueue(
            "mubtkir_ai_creator.lib.remote_import.importer.run_import",
            import_name=retry_doc.name,
            queue="long",
            timeout=7200,
            job_id=f"ai_import_retry_{retry_doc.name}",
        )
        return {"status": "Queued", "retry_import": retry_doc.name, "retry_rows": len(retry_rows)}
    else:
        result = run_import(retry_doc.name)
        result["retry_import"] = retry_doc.name
        return result
