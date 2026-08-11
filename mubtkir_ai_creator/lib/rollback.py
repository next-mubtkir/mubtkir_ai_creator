"""التراجع عن عملية كتابة سابقة باستخدام النسخة المحفوظة قبل التعديل.

يعيد فقط الحقول التي عدّلتها تلك العملية تحديدًا (لا كامل المستند)، لتفادي
التراجع عن تغييرات أخرى حدثت لاحقًا على حقول مختلفة من نفس المستند.
"""

import json
import time

import frappe

from mubtkir_ai_creator.lib.agent import _dump, log_action
from mubtkir_ai_creator.lib.client import FrappeSiteClient

# لكل أداة قابلة للتراجع: كيف نستخرج منها (doctype, name, الحقول المعدَّلة)
# بعض الأدوات (مثل update_print_format) لا ترسل doctype ضمن مدخلاتها لأنه
# مفترض ضمنيًا داخل الأداة نفسها، فيجب التعامل معها بشكل خاص لا بافتراض عام
def _resolve_target(tool_name, tool_input):
    if tool_name == "update_document":
        doctype = tool_input.get("doctype")
        name = tool_input.get("name")
        changed_fields = tool_input.get("data") or {}
        return doctype, name, changed_fields

    if tool_name == "update_print_format":
        doctype = "Print Format"
        name = tool_input.get("name")
        changed_fields = {k: v for k, v in tool_input.items() if k in ("html", "css")}
        return doctype, name, changed_fields

    return None, None, {}


REVERSIBLE_TOOLS = {"update_document", "update_print_format"}


def can_rollback(log_name):
    log = frappe.get_doc("AI Action Log", log_name)
    if not log.is_success or log.tool_name not in REVERSIBLE_TOOLS or not log.value_before:
        return False

    tool_input = json.loads(log.tool_input or "{}")
    doctype, name, changed_fields = _resolve_target(log.tool_name, tool_input)
    return bool(doctype and name and changed_fields)


def rollback(log_name):
    log = frappe.get_doc("AI Action Log", log_name)
    if not can_rollback(log_name):
        frappe.throw("لا يمكن التراجع عن هذه العملية — إما فشلت أصلًا أو لا تتوفر لها نسخة سابقة")

    tool_input = json.loads(log.tool_input or "{}")
    before = json.loads(log.value_before or "{}")
    doctype, name, changed_fields = _resolve_target(log.tool_name, tool_input)

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
