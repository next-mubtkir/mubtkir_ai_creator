import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

MAX_TARGETS = 10


class AIDeployment(Document):
    def validate(self):
        if len(self.targets or []) > MAX_TARGETS:
            frappe.throw(f"الحد الأقصى {MAX_TARGETS} عملاء في عملية النشر الواحدة")

        seen = set()
        for row in self.targets or []:
            if row.client_site in seen:
                frappe.throw(f"العميل {row.client_site} مكرر في قائمة الأهداف")
            seen.add(row.client_site)

        if self.deployment_type in ("Custom Field", "Settings") and not self.target_doctype:
            frappe.throw("حدد الـ DocType المستهدف")

        self.total_targets = len(self.targets or [])


@frappe.whitelist()
def run_preview(name):
    from mubtkir_ai_creator.lib.deployment import preview

    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return preview(name)


@frappe.whitelist()
def approve_and_execute(name):
    from mubtkir_ai_creator.lib.deployment import execute

    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Deployment", name)

    if doc.status not in ("Previewed", "Pending Approval"):
        frappe.throw("نفّذ المعاينة أولًا قبل الاعتماد")

    doc.db_set("approved_by", frappe.session.user)
    doc.db_set("approved_on", now_datetime())
    doc.db_set("status", "Approved")
    return execute(name)
