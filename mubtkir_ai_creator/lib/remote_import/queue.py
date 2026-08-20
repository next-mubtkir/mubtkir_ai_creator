"""Queue Engine — background job management using frappe.enqueue."""

import json

import frappe


def enqueue_import(import_name):
    """Queue an import for background execution.

    If the import exceeds the large_import_threshold from AI Settings,
    creates an AI Task that requires approval before execution.
    """
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status in ("Running", "Queued"):
        frappe.throw("This import is already running")

    settings = frappe.get_single("AI Settings")
    timeout = getattr(settings, "import_timeout", 0) or 7200
    threshold = getattr(settings, "large_import_threshold", 0) or 0
    require_approval = getattr(settings, "require_approval_large_import", 0)

    # Check if import needs approval (large row count)
    if require_approval and threshold and doc.total_rows and doc.total_rows > threshold:
        task = _create_import_task(doc)
        doc.db_set("task", task)
        doc.db_set("status", "Pending")
        frappe.db.commit()
        return {
            "status": "Approval Required",
            "import_name": import_name,
            "task": task,
            "message": f"Import has {doc.total_rows} rows (threshold: {threshold}). Approval required — see AI Task {task}",
        }

    doc.db_set("status", "Queued")
    frappe.db.commit()

    frappe.enqueue(
        "mubtkir_ai_creator.lib.remote_import.importer.run_import",
        import_name=import_name,
        queue="long",
        timeout=timeout,
        job_id=f"ai_import_{import_name}",
    )

    return {"status": "Queued", "import_name": import_name}


def _create_import_task(doc):
    """Create an AI Task for approval of a large import."""
    task = frappe.get_doc({
        "doctype": "AI Task",
        "client_site": doc.client_site,
        "session": doc.session or None,
        "request_text": f"Remote Import: {doc.total_rows} rows of {doc.remote_doctype} ({doc.import_type})",
        "risk_level": "High",
        "approval_required": 1,
        "planned_calls": json.dumps([{
            "tool": "remote_import",
            "args": {"import_name": doc.name, "doctype": doc.remote_doctype, "rows": doc.total_rows},
        }], ensure_ascii=False),
    })
    task.insert(ignore_permissions=True)
    frappe.db.commit()
    return task.name


def cancel_import(import_name):
    """Cancel a running/queued import."""
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status not in ("Running", "Queued"):
        frappe.throw("Cannot cancel an import that is not running")

    doc.db_set("status", "Cancelled")
    doc.db_set("is_resumable", 1 if doc.imported_rows else 0)
    frappe.db.commit()

    return {"status": "Cancelled", "import_name": import_name}


def get_import_status(import_name):
    """Get current status of an import."""
    doc = frappe.get_doc("AI Remote Import", import_name)
    return {
        "name": doc.name,
        "status": doc.status,
        "total_rows": doc.total_rows,
        "imported_rows": doc.imported_rows,
        "failed_rows": doc.failed_rows,
        "skipped_rows": doc.skipped_rows,
        "current_batch": doc.current_batch,
        "total_batches": doc.total_batches,
        "progress_percent": doc.progress_percent,
        "duration": doc.duration,
        "is_resumable": doc.is_resumable,
    }
