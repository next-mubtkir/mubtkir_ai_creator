"""دورة عمل الوكيل: Understand → Inspect → Plan → Risk → Approval → Execute → Verify → Log."""

import json
import time

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib import llm, tools
from mubtkir_ai_creator.lib.client import FrappeSiteClient
from mubtkir_ai_creator.ai_creator.doctype.ai_settings.ai_settings import get_limits


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


def _dump(value, limit=None):
    cap = limit or get_limits()["log_truncation_limit"]
    try:
        return json.dumps(value, ensure_ascii=False, default=str)[:cap]
    except Exception:
        return str(value)[:cap]


# ---------------- تقييم الخطورة ----------------

def needs_approval(risk):
    if risk == "low":
        return False
    if risk == "high":
        return True
    return bool(frappe.db.get_single_value("AI Settings", "require_approval_medium"))


# ---------------- الحلقة الرئيسية ----------------

def run_turn(session_name, user_message, file_urls=None):
    """دورة محادثة واحدة. تنفذ أدوات القراءة تلقائيًا، وتتوقف عند أول Tool تحتاج موافقة.

    file_urls: مرفقات اختيارية (Excel/CSV/صور) تُحوَّل إلى كتل محتوى مع الرسالة.
    """
    from mubtkir_ai_creator.lib.attachments import build_user_content

    session = frappe.get_doc("AI Session", session_name)
    if session.status != "Open":
        frappe.throw("الجلسة مغلقة")

    client_site = session.client_site  # الموقع مقفل على الجلسة
    client = FrappeSiteClient(client_site)

    content = build_user_content(user_message, file_urls)
    session.append_message("user", content)
    messages = session.get_messages()
    tool_defs = tools.get_tool_definitions()

    # تمرير نوع الطلب للنموذج بالـ System Prompt
    rtype = session.request_type or "Other"
    system = llm.SYSTEM_PROMPT.replace("{request_type}", rtype)

    limits = get_limits()
    for _ in range(limits["max_agent_iterations"]):
        result = llm.chat(messages, tools=tool_defs, system=system)

        if not result["tool_calls"]:
            session.append_message("assistant", result["text"])
            return {"type": "message", "text": result["text"]}

        # التحقق من صحة كل استدعاء قبل أي تنفيذ أو طلب موافقة — يمنع أخطاء
        # مثل معامل اخترعه النموذج ولا وجود له، ويتيح له تصحيح الاستدعاء
        # ضمن نفس الدورة بدل أن يفشل بعد اعتماد المستخدم للعملية
        invalid = {
            c["id"]: tools.validate_call(c["name"], c.get("input") or {})
            for c in result["tool_calls"]
        }
        invalid = {k: v for k, v in invalid.items() if v}

        if invalid:
            assistant_blocks = []
            if result["text"]:
                assistant_blocks.append({"type": "text", "text": result["text"]})
            tool_results = []
            for call in result["tool_calls"]:
                assistant_blocks.append(
                    {"type": "tool_use", "id": call["id"], "name": call["name"], "input": call["input"]}
                )
                err = invalid.get(call["id"])
                content = err if err else "لم يُنفَّذ بعد — بانتظار تصحيح استدعاء آخر في نفس الرد"
                tool_results.append(
                    {"type": "tool_result", "tool_use_id": call["id"], "content": content}
                )

            messages.append({"role": "assistant", "content": assistant_blocks})
            messages.append({"role": "user", "content": tool_results})
            continue  # إعادة المحاولة بنفس الدورة بدل عرض خطأ للمستخدم

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
                    "content": _dump(output, limits["tool_result_max_chars"]),
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


WRITE_TOOLS_WITH_LINKS = ("create_document", "update_document")


def _mandatory_required_check(client, call):
    """بوابة إلزامية: لا يُنشأ مستند وحقوله الإجبارية ناقصة.

    بدل ترك ERPNext يرفض العملية برسالة تقنية، نوقفها مبكرًا ونعيد للمستخدم
    قائمة عربية بالحقول المطلوبة مع القيم المتاحة لحقول الربط.
    """
    if call["name"] != "create_document":
        return None

    args = call.get("input") or {}
    doctype = args.get("doctype")
    data = args.get("data")
    if not doctype or not isinstance(data, dict):
        return None

    try:
        result = tools.find_missing_required(client, doctype, data)
    except Exception as e:
        return f"تعذّر التحقق من الحقول الإجبارية قبل التنفيذ: {str(e)[:get_limits()["validation_error_limit"]]}"

    if result.get("is_complete"):
        return None

    lines = [f"أُلغيت العملية قبل التنفيذ: حقول إجبارية ناقصة في «{doctype}».", ""]
    for f in result["missing_required"]:
        label = f.get("label") or f.get("fieldname")
        line = f"- {label} ({f.get('fieldname')}) — النوع: {f.get('fieldtype')}"
        if f.get("link_to"):
            opts = f.get("available_options") or []
            line += f"، مرتبط بـ {f['link_to']}"
            if opts:
                line += f"\n  القيم المتاحة: {'، '.join(map(str, opts[:get_limits()["available_options_shown"]]))}"
        elif f.get("select_options"):
            line += f"\n  الخيارات: {'، '.join(map(str, [o for o in f['select_options'] if o][:get_limits()["select_options_shown"]]))}"
        lines.append(line)

    lines.append("")
    lines.append("أرسل قيم هذه الحقول ثم أعد المحاولة.")
    return "\n".join(lines)


def _mandatory_link_check(client, call):
    """فحص إلزامي في الكود لحقول الربط قبل أي كتابة.

    لا يعتمد على التزام النموذج بالتعليمات: إن كانت أي قيمة ربط غير موجودة
    لدى العميل، تُلغى العملية قبل إرسالها ويُعاد سبب واضح مع البدائل المتاحة.
    """
    if call["name"] not in WRITE_TOOLS_WITH_LINKS:
        return None

    args = call.get("input") or {}
    doctype = args.get("doctype")
    data = args.get("data")
    if not doctype or not isinstance(data, dict):
        return None

    try:
        result = tools.check_links(client, doctype, data)
    except Exception as e:
        # تعذّر الفحص لا يعني السماح: نوقف العملية بدل المخاطرة بكتابة خاطئة
        return f"تعذّر التحقق من حقول الربط قبل التنفيذ: {str(e)[:get_limits()["validation_error_limit"]]}"

    if result.get("all_valid"):
        return None

    lines = ["أُلغيت العملية قبل التنفيذ: قيم حقول ربط غير موجودة لدى العميل."]
    for field, info in (result.get("invalid_fields") or {}).items():
        opts = info.get("available_options") or []
        lines.append(
            f"- الحقل «{field}» (يرتبط بـ {info.get('doctype')}): القيمة المرسلة «{info.get('value')}» غير موجودة."
            + (f" القيم المتاحة: {'، '.join(map(str, opts[:get_limits()["available_options_shown"]]))}" if opts else " لا توجد قيم متاحة.")
        )
    lines.append("صحّح القيم من القائمة أعلاه ثم أعد المحاولة.")
    return "\n".join(lines)


def _mandatory_duplicate_field_check(client, call):
    """بوابة إلزامية: منع محاولة إنشاء Custom Field موجود فعلًا بدل فشل التنفيذ برسالة API خام."""
    if call["name"] != "add_custom_field":
        return None

    args = call.get("input") or {}
    dt = args.get("dt")
    fieldname = args.get("fieldname")
    if not dt or not fieldname:
        return None

    existing_name = f"{dt}-{fieldname}"
    try:
        client.get_doc("Custom Field", existing_name)
    except Exception:
        return None  # غير موجود — يُسمح بالإنشاء

    return (
        f"أُلغيت العملية قبل التنفيذ: يوجد حقل مخصص بالاسم «{fieldname}» في «{dt}» لدى هذا العميل مسبقًا "
        f"({existing_name}). لتعديل قيمته استخدم update_document على Custom Field بهذا الاسم، أو اختر "
        f"fieldname مختلفًا إن كان المطلوب حقلًا جديدًا فعلًا."
    )


# أدوات مرتبطة صراحة بنوع طلب معيّن — منعًا لخلط النطاقات داخل نفس المحادثة
# (مثلًا: محادثة Client Script يُطلب فيها تعديل Print Format). الأدوات العامة
# (create/update/delete_document وغيرها) تبقى متاحة دائمًا لأنها تُستخدم عبر كل الأنواع.
TYPE_RESTRICTED_TOOLS = {
    "patch_print_format_html": {"Print Format"},
    "update_print_format": {"Print Format"},
    "add_custom_field": {"Custom Field"},
    "list_workspaces": {"Workspace", "Custom HTML Block"},
    "get_workspace_content": {"Workspace", "Custom HTML Block"},
    "add_workspace_shortcut": {"Workspace"},
    "add_workspace_link": {"Workspace"},
    "add_workspace_block": {"Workspace"},
    "list_custom_blocks": {"Workspace", "Custom HTML Block"},
    "copy_between_clients": {"Transfer from Templates"},
    "create_bulk_deployment": {"Transfer from Templates"},
    "capture_as_template": {"Transfer from Templates"},
    "duplicate_within_client": {"Transfer from Templates"},
    "search_templates": {"Transfer from Templates"},
}


def _mandatory_request_type_check(session_name, call):
    allowed_types = TYPE_RESTRICTED_TOOLS.get(call["name"])
    if not allowed_types:
        return None
    rtype = frappe.db.get_value("AI Session", session_name, "request_type")
    if rtype in allowed_types:
        return None
    # "Transfer from Templates" و "Support Request" يحتاجون يوصلون لكل الأدوات بدون قيود
    if rtype in ("Transfer from Templates", "Support Request"):
        return None
    return (
        f"This request requires a new session: Tool «{call['name']}» is restricted to request type "
        f"«{'، '.join(sorted(allowed_types))}»، and this session is of type «{rtype or 'Unspecified'}». "
        f"Ask the user to start a new session with the appropriate request type."
    )


def _clean_api_error(raw):
    """Extract a clean, readable error message from raw API error strings.

    Handles: JSON exception bodies, Unicode escapes, _server_messages, stack traces.
    Returns a short human-readable string.
    """
    if not raw:
        return "Unknown error"
    import re

    # 1. Try to decode Unicode escapes (\u0644 → ل)
    decoded = raw
    if "\\u0" in raw:
        try:
            decoded = raw.encode("utf-8").decode("unicode_escape")
        except Exception:
            pass

    # 2. Try to extract _server_messages (list of JSON strings)
    sm_match = re.search(r'"_server_messages"\s*:\s*"(\[.+?\])"', decoded)
    if sm_match:
        try:
            msgs = json.loads(sm_match.group(1).replace('\\"', '"'))
            parts = []
            for m in msgs:
                try:
                    parts.append(json.loads(m).get("message", m))
                except Exception:
                    parts.append(str(m))
            if parts:
                return " | ".join(parts)[:get_limits()["error_display_limit"]]
        except Exception:
            pass

    # 3. Try to extract exception message from JSON body
    exc_match = re.search(r'"exception"\s*:\s*"([^"]+)"', decoded)
    if exc_match:
        msg = exc_match.group(1)
        # Remove exception class prefix
        msg = re.sub(r'^frappe\.exceptions\.\w+:\s*', '', msg)
        # Remove \n and traceback noise
        msg = msg.split("\\n")[0].strip()
        if msg:
            return msg[:get_limits()["error_display_limit"]]

    # 4. Try to find ValidationError/LinkValidationError message directly
    val_match = re.search(r'(?:ValidationError|LinkValidationError):\s*(.+?)(?:\\n|$)', decoded)
    if val_match:
        return val_match.group(1).strip()[:get_limits()["error_display_limit"]]

    # 5. Try OperationalError
    op_match = re.search(r'OperationalError.*?:\s*(.+?)(?:\\n|$)', decoded)
    if op_match:
        return op_match.group(1).strip()[:get_limits()["error_display_limit"]]

    # 6. Fallback: strip URLs and code noise, return first meaningful part
    clean = re.sub(r'https?://[^\s,}"]+', '', decoded)
    clean = re.sub(r'\\n', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    # Try to find the Arabic/English message part
    msg_match = re.search(r'"message"\s*:\s*"([^"]+)"', clean)
    if msg_match:
        return msg_match.group(1)[:get_limits()["error_display_limit"]]

    return clean[:get_limits()["error_display_limit"]] if clean else "Unknown error"


def _execute_call(client, client_site, session_name, task_name, call):
    start = time.time()
    risk = tools.get_risk(call["name"])
    before = None

    # طبقة دفاع ثانية: التحقق من صحة المعاملات مرة أخرى فور التنفيذ الفعلي
    # (مثلًا عند تنفيذ مهمة اعتُمدت سابقًا)، ثم البوابات الإلزامية المعتادة
    invalid = tools.validate_call(call["name"], call.get("input") or {})
    blocked = (
        invalid
        or _mandatory_required_check(client, call)
        or _mandatory_link_check(client, call)
        or _mandatory_duplicate_field_check(client, call)
        or _mandatory_request_type_check(session_name, call)
    )
    if blocked:
        log_action(
            client_site=client_site,
            site_url=client.site_url,
            session=session_name,
            task=task_name,
            tool_name=call["name"],
            risk_level=risk,
            tool_input=_dump(call.get("input") or {}),
            tool_output=None,
            is_success=0,
            duration_ms=int((time.time() - start) * 1000),
            error_message=blocked[:get_limits()["error_message_limit"]],
        )
        return {"error": blocked}

    # لقطة قبل التعديل للعمليات القابلة للاسترجاع
    args = call.get("input") or {}
    if call["name"] in ("update_document", "update_print_format", "patch_print_format_html", "patch_document_field", "submit_document", "cancel_document", "delete_document"):
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
        raw_error = str(e)[:get_limits()["error_display_limit"] * 4]
        error = _clean_api_error(raw_error)
        output, success = {"error": error}, 0

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

    # استخراج نص الخطأ الفعلي لعرضه في الواجهة
    error_text = None
    for r in results:
        res = r.get("result")
        if isinstance(res, dict) and res.get("error"):
            error_text = f"[{r.get('tool')}] {res['error']}"
            break

    verification = verify_task(client, calls, results)
    task.db_set("verification_result", _dump(verification))
    task.db_set("status", "Failed" if failed else "Completed")
    if failed:
        task.db_set("error_message", (error_text or "Unspecified failure")[:get_limits()["error_message_limit"]])

    frappe.db.commit()
    return {
        "status": task.status,
        "results": results,
        "verification": verification,
        "error": error_text,
    }


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
                checks.append({"tool": call["name"], "verified": False, "error": str(e)[:get_limits()["validation_error_limit"]]})

        elif call["name"] in ("create_document", "add_custom_field"):
            created = (res.get("result") or {}) if isinstance(res.get("result"), dict) else {}
            checks.append({
                "tool": call["name"],
                "created_name": created.get("name"),
                "verified": bool(created.get("name")),
            })

    return checks or [{"note": "لا توجد عمليات كتابة تحتاج تحققًا"}]
