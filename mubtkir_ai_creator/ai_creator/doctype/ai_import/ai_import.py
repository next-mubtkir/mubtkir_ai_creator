import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class AIImport(Document):
    def before_insert(self):
        if not self.title:
            self.title = f"{self.target_doctype or 'Import'} Import on {now_datetime().strftime('%Y-%m-%d %H:%M:%S.%f')}"


@frappe.whitelist()
def get_client_doctypes(client_site):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    from mubtkir_ai_creator.lib.client import FrappeSiteClient

    client = FrappeSiteClient(client_site)
    rows = client.get_list(
        "DocType", fields=["name"], filters={"istable": 0, "issingle": 0},
        limit=1000, order_by="name asc",
    ).get("data") or []
    return sorted({r.get("name") for r in rows if r.get("name")})


@frappe.whitelist()
def get_target_fields(client_site, target_doctype):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    from mubtkir_ai_creator.lib.client import FrappeSiteClient

    client = FrappeSiteClient(client_site)
    meta = client.get_meta(target_doctype).get("data", {}) or {}
    skip = ("Section Break", "Column Break", "Tab Break", "HTML", "Table", "Table MultiSelect")
    return [
        {"fieldname": f.get("fieldname"), "label": f.get("label") or f.get("fieldname"), "reqd": bool(f.get("reqd"))}
        for f in meta.get("fields", [])
        if f.get("fieldname") and f.get("fieldtype") not in skip
    ]


@frappe.whitelist()
def get_template(client_site, target_doctype):
    from mubtkir_ai_creator.lib.importer import get_template as _get_template

    return _get_template(client_site, target_doctype)


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
