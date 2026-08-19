"""Log Engine — import dashboard statistics and history."""

import frappe


def get_dashboard_stats():
    """Return aggregate dashboard statistics."""
    total = frappe.db.count("AI Import Log")
    success = frappe.db.count("AI Import Log", {"status": "Success"})
    failed = frappe.db.count("AI Import Log", {"status": "Failed"})
    partial = frappe.db.count("AI Import Log", {"status": "Partial Success"})

    # Average speed
    avg_speed = frappe.db.sql("""
        SELECT AVG(avg_speed) FROM `tabAI Import Log`
        WHERE avg_speed > 0
    """)[0][0] or 0

    # Most imported DocTypes
    top_doctypes = frappe.db.sql("""
        SELECT remote_doctype, COUNT(*) as cnt, SUM(imported_rows) as total_imported
        FROM `tabAI Import Log`
        GROUP BY remote_doctype
        ORDER BY cnt DESC
        LIMIT 10
    """, as_dict=True)

    # Most active clients
    top_clients = frappe.db.sql("""
        SELECT client_site, COUNT(*) as cnt, SUM(imported_rows) as total_imported
        FROM `tabAI Import Log`
        GROUP BY client_site
        ORDER BY cnt DESC
        LIMIT 10
    """, as_dict=True)

    # Recent imports
    recent = frappe.get_all(
        "AI Import Log",
        fields=["name", "client_site", "remote_doctype", "status",
                "total_rows", "imported_rows", "failed_rows", "duration",
                "started_on", "finished_on"],
        order_by="creation desc",
        limit=20,
    )

    return {
        "total_imports": total,
        "successful": success,
        "failed": failed,
        "partial": partial,
        "avg_speed": round(avg_speed, 2),
        "top_doctypes": top_doctypes,
        "top_clients": top_clients,
        "recent": recent,
    }


def get_import_history(client_site=None, doctype=None, status=None, limit=50):
    """Get import history with optional filters."""
    filters = {}
    if client_site:
        filters["client_site"] = client_site
    if doctype:
        filters["remote_doctype"] = doctype
    if status:
        filters["status"] = status

    return frappe.get_all(
        "AI Import Log",
        filters=filters,
        fields=["name", "remote_import", "client_site", "remote_doctype", "import_type",
                "status", "file_name", "total_rows", "imported_rows", "failed_rows",
                "skipped_rows", "duration", "avg_speed", "started_on", "finished_on"],
        order_by="creation desc",
        limit_page_length=limit,
    )
