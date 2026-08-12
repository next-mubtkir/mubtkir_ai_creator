import json

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class AITask(Document):
    pass


@frappe.whitelist()
def approve(name, scheduled_time=None):
    """اعتماد مهمة — تنفيذ فوري أو جدولة لوقت لاحق."""
    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    task = frappe.get_doc("AI Task", name)
    if task.status != "Pending Approval":
        frappe.throw("هذه المهمة ليست بانتظار الموافقة")

    task.db_set("approved_by", frappe.session.user)
    task.db_set("approved_on", now_datetime())

    if scheduled_time:
        task.db_set("scheduled_time", scheduled_time)
        task.db_set("status", "Approved")
        frappe.db.commit()
        return {"status": "Scheduled", "scheduled_time": scheduled_time}

    task.db_set("status", "Approved")

    from mubtkir_ai_creator.lib.agent import execute_task

    return execute_task(name)


@frappe.whitelist()
def reject(name, reason=None):
    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    task = frappe.get_doc("AI Task", name)
    task.db_set("status", "Rejected")
    task.db_set("rejection_reason", reason or "")
    return {"status": "Rejected"}
