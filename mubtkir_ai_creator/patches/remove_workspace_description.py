"""حذف فقرة 'منصة مركزية...' من Workspace الرئيسي — لا تتحدث تلقائيًا عبر migrate."""
import json
import frappe


def execute():
    name = "AI Creator"
    if not frappe.db.exists("Workspace", name):
        return

    doc = frappe.get_doc("Workspace", name)
    try:
        content = json.loads(doc.content or "[]")
    except (json.JSONDecodeError, TypeError):
        return

    before = len(content)
    content = [c for c in content if not (c.get("type") == "paragraph" and "منصة مركزية" in (c.get("data", {}).get("text", "")))]

    if len(content) < before:
        doc.content = json.dumps(content, ensure_ascii=False)
        doc.save(ignore_permissions=True)
        frappe.db.commit()
