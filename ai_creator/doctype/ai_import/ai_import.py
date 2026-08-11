import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class AIImport(Document):
    pass


@frappe.whitelist()
def analyze(name):
    from mubtkir_ai_creator.lib.importer import analyze as _analyze

    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return _analyze(name)


@frappe.whitelist()
def run_preview(name):
    from mubtkir_ai_creator.lib.importer import preview

    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return preview(name)


@frappe.whitelist()
def approve_and_run(name):
    from mubtkir_ai_creator.lib.importer import enqueue_execute

    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Import", name)
    if doc.status != "Pending Approval":
        frappe.throw("نفّذ المعاينة أولًا")

    doc.db_set("approved_by", frappe.session.user)
    doc.db_set("approved_on", now_datetime())
    doc.db_set("status", "Approved")
    return enqueue_execute(name)
