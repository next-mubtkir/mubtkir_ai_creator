"""التراجع عن عملية كتابة سابقة باستخدام النسخة المحفوظة قبل التعديل.

يعيد فقط الحقول التي عدّلتها تلك العملية تحديدًا (لا كامل المستند)، لتفادي
التراجع عن تغييرات أخرى حدثت لاحقًا على حقول مختلفة من نفس المستند.
"""

import json
import time

import frappe

from mubtkir_ai_creator.lib.agent import _dump, log_action
from mubtkir_ai_creator.lib.client import FrappeSiteClient

# الأدوات التي تحفظ لقطة قبل التعديل ويمكن التراجع عنها
REVERSIBLE_TOOLS = {"update_document", "update_print_format"}


def can_rollback(log_name):
    log = frappe.get_doc("AI Action Log", log_name)
    if not log.is_success or log.tool_name not in REVERSIBLE_TOOLS or not log.value_before:
        return False
    tool_input = json.loads(log.tool_input or "{}")
    return bool(tool_input.get("doctype") and tool_input.get("name") and tool_input.get("data"))


def rollback(log_name):
    log = frappe.get_doc("AI Action Log", log_name)
    if not can_rollback(log_name):
        frappe.throw("لا يمكن التراجع عن هذه العملية — إما فشلت أصلًا أو لا تتوفر لها نسخة سابقة")

    tool_input = json.loads(log.tool_input or "{}")
    before = json.loads(log.value_before or "{}")
    doctype, name, changed_fields = tool_input["doctype"], tool_input["name"], tool_input["data"]

    # نعيد فقط الحقول التي عدّلتها العملية الأصلية، بقيمتها كما كانت قبلها
    restore = {k: before.get(k) for k in changed_fields.keys() if k in before}
    if not restore:
        frappe.throw("تعذّر تحديد الحقول المطلوب التراجع عنها")

    start = time.time()
    client = FrappeSiteClient(log.client_site)
    try:
        out = client.update_doc(doctype, name, restore)
        success, error = 1, None
    except Exception as e:
        out, success, error = None, 0, str(e)[:1000]

    log_action(
        client_site=log.client_site,
        site_url=client.site_url,
        tool_name="rollback",
        risk_level="high",
        tool_input=_dump({"reverts_log": log.name, "doctype": doctype, "name": name, "restored_fields": restore}),
        tool_output=_dump(out),
        is_success=success,
        duration_ms=int((time.time() - start) * 1000),
        error_message=error,
    )

    if not success:
        frappe.throw(f"فشل التراجع: {error}")

    return {"restored_fields": list(restore.keys()), "doctype": doctype, "name": name}


@frappe.whitelist()
def run_rollback(log_name):
    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    return rollback(log_name)


@frappe.whitelist()
def check_can_rollback(log_name):
    return {"can_rollback": can_rollback(log_name)}
