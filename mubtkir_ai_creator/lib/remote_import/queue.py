"""Queue Engine — background job management using frappe.enqueue."""

import frappe


def enqueue_import(import_name):
    """Queue an import for background execution."""
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status in ("Running", "Queued"):
        frappe.throw("هذا الاستيراد قيد التنفيذ بالفعل")

    doc.db_set("status", "Queued")
    frappe.db.commit()

    frappe.enqueue(
        "mubtkir_ai_creator.lib.remote_import.importer.run_import",
        import_name=import_name,
        queue="long",
        timeout=7200,  # 2 hours max
        job_id=f"ai_import_{import_name}",
    )

    return {"status": "Queued", "import_name": import_name}


def cancel_import(import_name):
    """Cancel a running/queued import."""
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status not in ("Running", "Queued"):
        frappe.throw("لا يمكن إلغاء استيراد ليس قيد التنفيذ")

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
