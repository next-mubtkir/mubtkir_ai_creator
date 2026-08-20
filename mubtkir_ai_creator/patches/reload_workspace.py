import frappe


def execute():
    """Force reload AI Creator workspace from JSON to pick up new links."""
    if frappe.db.exists("Workspace", "AI Creator"):
        frappe.delete_doc("Workspace", "AI Creator", force=True)
        frappe.db.commit()
