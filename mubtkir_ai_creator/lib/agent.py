"""دورة عمل الوكيل: Understand → Inspect → Plan → Risk → Approval → Execute → Verify → Log."""

import json
import time

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib import llm, tools
from mubtkir_ai_creator.lib.client import FrappeSiteClient

MAX_ITERATIONS = 8


# ---------------- سجل التدقيق ----------------

def log_action(**kwargs):
    doc = frappe.get_doc({
        "doctype": "AI Action Log",
        "timestamp": now_datetime(),
        "log_user": frappe.session.user,
        **kwargs,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


def _dump(value):
    try:
        return json.dumps(value, ensure_ascii=False, default=str)[:20000]
    except Exception:
        return str(value)[:20000]


# ---------------- تقييم الخطورة ----------------

def needs_approval(risk):
    if risk == "low":
        return False
    if risk == "high":
        return True
    return bool(frappe.db.get_single_value("AI Settings", "require_approval_medium"))


# ---------------- الحلقة الرئيسية ----------------

def run_turn(session_name, user_message):
    """دورة محادثة واحدة. تنفذ أدوات القراءة تلقائيًا، وتتوقف عند أول أداة تحتاج موافقة."""
    session = frappe.get_doc("AI Session", session_name)
    if session.status != "Open":
        frappe.throw("الجلسة مغلقة")

    client_site = session.client_site  # الموقع مقفل على الجلسة
    client = FrappeSiteClient(client_site)

    session.append_message("user", user_message)
    messages = session.get_messages()
    tool_defs = tools.get_tool_definitions()

    for _ in range(MAX_ITERATIONS):
        result = llm.chat(messages, tools=tool_defs)

        if not result["tool_calls"]:
            session.append_message("assistant", result["text"])
            return {"type": "message", "text": result["text"]}

        # فحص الخطورة قبل أي تنفيذ
        pending = [c for c in result["tool_calls"] if needs_approval(tools.get_risk(c["name"]))]

        if pending:
            task = _create_pending_task(
                session, client_site, user_message, result["text"], result["tool_calls"]
            )
            session.append_message("assistant", result["text"])
            return {
                "type": "approval_required",
                "task": task.name,
                "plan": result["text"],
                "risk_level": task.risk_level,
                "calls": result["tool_calls"],
            }

        # كل الأدوات منخفضة الخطورة: تنفيذ مباشر
        assistant_blocks = []
        if result["text"]:
            assistant_blocks.append({"type": "text", "text": result["text"]})
        tool_results = []

        for call in result["tool_calls"]:
            output = _execute_call(client, client_site, session.name, None, call)
            assistant_blocks.append(
                {"type": "tool_use", "id": call["id"], "name": call["name"], "input": call["input"]}
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": call["id"],
                    "content": _dump(output)[:8000],
                }
            )

        messages.append({"role": "assistant", "content": assistant_blocks})
        messages.append({"role": "user", "content": tool_results})

    return {"type": "message", "text": "تم بلوغ الحد الأقصى لعدد الخطوات دون الوصول لنتيجة نهائية."}


def _create_pending_task(session, client_site, request_text, plan, calls):
    risks = [tools.get_risk(c["name"]) for c in calls]
    level = "High" if "high" in risks else ("Medium" if "medium" in risks else "Low")

    task = frappe.get_doc({
        "doctype": "AI Task",
        "session": session.name,
        "client_site": client_site,
        "request_text": request_text,
        "plan": plan,
        "planned_calls": json.dumps(calls, ensure_ascii=False, indent=2),
        "risk_level": level,
        "approval_required": 1,
        "status": "Pending Approval",
    })
    task.insert(ignore_permissions=True)
    frappe.db.commit()
    return task


def _execute_call(client, client_site, session_name, task_name, call):
    start = time.time()
    risk = tools.get_risk(call["name"])
    before = None

    # لقطة قبل التعديل للعمليات القابلة للاسترجاع
    args = call.get("input") or {}
    if call["name"] in ("update_document", "update_print_format", "submit_document", "cancel_document", "delete_document"):
        try:
            dt = args.get("doctype") or "Print Format"
            nm = args.get("name")
            if nm:
                before = client.get_doc(dt, nm).get("data")
        except Exception:
            before = None

    try:
        output = tools.run_tool(client, call["name"], args)
        success, error = 1, None
    except Exception as e:
        output, success, error = None, 0, str(e)[:1000]

    log_action(
        client_site=client_site,
        site_url=client.site_url,
        session=session_name,
        task=task_name,
        tool_name=call["name"],
        risk_level=risk,
        tool_input=_dump(args),
        tool_output=_dump(output),
        value_before=_dump(before) if before else None,
        value_after=_dump(output) if success and risk != "low" else None,
        is_success=success,
        duration_ms=int((time.time() - start) * 1000),
        error_message=error,
    )

    if not success:
        return {"error": error}
    return output


def execute_task(task_name):
    """تنفيذ مهمة بعد اعتمادها، ثم التحقق من النتيجة."""
    task = frappe.get_doc("AI Task", task_name)
    if task.status != "Approved":
        frappe.throw("لا يمكن تنفيذ مهمة غير معتمدة")

    task.db_set("status", "Executing")
    client = FrappeSiteClient(task.client_site)
    calls = json.loads(task.planned_calls or "[]")

    results, failed = [], False
    for call in calls:
        out = _execute_call(client, task.client_site, task.session, task.name, call)
        results.append({"tool": call["name"], "result": out})
        if isinstance(out, dict) and out.get("error"):
            failed = True
            break  # منع التنفيذ الجزئي الصامت: التوقف عند أول فشل

    task.db_set("execution_result", _dump(results))

    verification = verify_task(client, calls, results)
    task.db_set("verification_result", _dump(verification))
    task.db_set("status", "Failed" if failed else "Completed")
    if failed:
        task.db_set("error_message", "توقف التنفيذ عند أول خطأ — راجع سجل التدقيق")

    frappe.db.commit()
    return {"status": task.status, "results": results, "verification": verification}


def verify_task(client, calls, results):
    """التحقق بعد التنفيذ: نجاح API لا يعني نجاح المهمة."""
    checks = []
    for call, res in zip(calls, results):
        args = call.get("input") or {}
        name = args.get("name")
        doctype = args.get("doctype")

        if call["name"] in ("update_document", "submit_document", "cancel_document") and name and doctype:
            try:
                current = client.get_doc(doctype, name).get("data") or {}
                checks.append({
                    "tool": call["name"],
                    "doctype": doctype,
                    "name": name,
                    "docstatus": current.get("docstatus"),
                    "modified": current.get("modified"),
                    "verified": True,
                })
            except Exception as e:
                checks.append({"tool": call["name"], "verified": False, "error": str(e)[:300]})

        elif call["name"] in ("create_document", "add_custom_field"):
            created = (res.get("result") or {}) if isinstance(res.get("result"), dict) else {}
            checks.append({
                "tool": call["name"],
                "created_name": created.get("name"),
                "verified": bool(created.get("name")),
            })

    return checks or [{"note": "لا توجد عمليات كتابة تحتاج تحققًا"}]
