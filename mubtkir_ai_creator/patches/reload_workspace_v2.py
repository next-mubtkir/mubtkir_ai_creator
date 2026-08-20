import frappe


def execute():
    """Force reload AI Creator workspace to show new Remote Import section."""
    if frappe.db.exists("Workspace", "AI Creator"):
        frappe.delete_doc("Workspace", "AI Creator", force=True, ignore_permissions=True)
        frappe.db.commit()
