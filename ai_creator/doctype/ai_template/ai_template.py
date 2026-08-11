import frappe
from frappe.model.document import Document


class AITemplate(Document):
    pass


@frappe.whitelist()
def create_deployment_from_template(name):
    """إنشاء عملية نشر جماعي مبنية على هذا القالب."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    tpl = frappe.get_doc("AI Template", name)

    if not tpl.deployable:
        frappe.throw(
            "هذا النوع غير قابل للنشر على عملاء آخرين. "
            "Server Script يعمل على سيرفر العميل وقد يعطّل عمله، فهو للتوثيق والتصدير فقط."
        )

    if tpl.artifact_type not in ("Print Format", "Custom Field"):
        frappe.throw(
            f"النشر الجماعي يدعم Print Format و Custom Field فقط حاليًا. النوع الحالي: {tpl.artifact_type}"
        )

    dep = frappe.get_doc({
        "doctype": "AI Deployment",
        "title": f"نشر: {tpl.title}",
        "deployment_type": tpl.artifact_type,
        "source_mode": "من قالب",
        "source_template": tpl.name,
        "target_doctype": tpl.target_doctype,
    })
    dep.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"deployment": dep.name}
