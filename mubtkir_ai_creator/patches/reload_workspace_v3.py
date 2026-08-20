import frappe


def execute():
    """Force reload AI Creator workspace — runs in pre_model_sync so Frappe recreates it from JSON."""
    if frappe.db.exists("Workspace", "AI Creator"):
        frappe.delete_doc("Workspace", "AI Creator", force=True, ignore_permissions=True)
        frappe.db.commit()
