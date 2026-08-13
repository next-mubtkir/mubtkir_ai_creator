"""نقاط الاتصال المتاحة للواجهة."""

import frappe

from mubtkir_ai_creator.lib import agent


@frappe.whitelist()
def get_clients():
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return frappe.get_all(
        "AI Client Site",
        filters={"is_active": 1},
        fields=["name", "client_name", "site_url", "status"],
        order_by="client_name asc",
    )


@frappe.whitelist()
def start_session(client_site, title=None, request_type=None):
    """Start a session locked to one client site."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc({
        "doctype": "AI Session",
        "client_site": client_site,
        "title": title or client_site,
        "request_type": request_type or "",
    })
    doc.insert()
    frappe.db.commit()
    return {"session": doc.name, "client_site": doc.client_site, "request_type": doc.request_type}


@frappe.whitelist()
def send_message(session, message, attachments=None):
    """إرسال رسالة للوكيل. الموقع المستهدف يُؤخذ من الجلسة وليس من نص الرسالة.

    attachments: قائمة روابط ملفات (JSON string أو list) مرفوعة ومرتبطة بالجلسة.
    """
    import json as _json

    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])

    file_urls = attachments
    if isinstance(attachments, str):
        try:
            file_urls = _json.loads(attachments)
        except ValueError:
            file_urls = [attachments] if attachments else []

    return agent.run_turn(session, message, file_urls=file_urls or None)


@frappe.whitelist()
def get_session_messages(session):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Session", session)
    return doc.get_messages()


@frappe.whitelist()
def close_session(session):
    from frappe.utils import now_datetime

    doc = frappe.get_doc("AI Session", session)
    doc.db_set("status", "Closed")
    doc.db_set("ended_on", now_datetime())
    return {"status": "Closed"}


@frappe.whitelist()
def update_session_info(session, title=None, request_type=None):
    """Update session metadata (title, request type)."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Session", session)
    if title is not None:
        doc.db_set("title", title)
    if request_type is not None:
        doc.db_set("request_type", request_type)
    return {"ok": True}


@frappe.whitelist()
def get_session_stats(session):
    """Return live stats for the session info panel."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Session", session)
    msgs = doc.get_messages()

    tool_count = frappe.db.count("AI Action Log", {"session": session})

    # Rough token estimation: ~4 chars per token for mixed Arabic/English
    total_chars = sum(
        len(str(m.get("content", ""))) for m in msgs
    )
    est_tokens = int(total_chars / 3.5)  # conservative for Arabic

    return {
        "session": doc.name,
        "client_site": doc.client_site,
        "title": doc.title,
        "request_type": doc.request_type,
        "status": doc.status,
        "session_user": doc.session_user,
        "started_on": str(doc.started_on or ""),
        "modified": str(doc.modified or ""),
        "message_count": len(msgs),
        "tool_count": tool_count,
        "est_tokens": est_tokens,
    }


@frappe.whitelist()
def list_recent_sessions(client_site=None, request_type=None, search=None, limit=30):
    """List recent sessions for the sidebar."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    filters = {"session_user": frappe.session.user}
    if client_site:
        filters["client_site"] = client_site
    if request_type:
        filters["request_type"] = request_type

    or_filters = None
    if search:
        search = f"%{search}%"
        or_filters = [
            ["title", "like", search],
            ["client_site", "like", search],
        ]

    rows = frappe.get_all(
        "AI Session",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "title", "client_site", "status", "request_type", "started_on", "ended_on", "modified"],
        order_by="modified desc",
        limit_page_length=int(limit or 30),
    )

    for r in rows:
        doc = frappe.get_doc("AI Session", r["name"])
        msgs = doc.get_messages()
        last_text = ""
        for m in reversed(msgs):
            content = m.get("content")
            if isinstance(content, str):
                last_text = content
                break
            if isinstance(content, list):
                texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
                if texts:
                    last_text = texts[-1]
                    break
        r["message_count"] = len(msgs)
        r["last_message"] = (last_text or "")[:150]

    return rows


@frappe.whitelist()
def reopen_session(session):
    """إعادة فتح جلسة مغلقة لمتابعة المحادثة من حيث توقفت."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc("AI Session", session)
    if doc.session_user != frappe.session.user:
        frappe.throw("لا يمكنك متابعة جلسة موظف آخر")

    doc.db_set("status", "Open")
    doc.db_set("ended_on", None)
    return {"session": doc.name, "client_site": doc.client_site, "title": doc.title}


@frappe.whitelist()
def save_pinned(session, pinned_message=None):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    frappe.db.set_value("AI Session", session, "pinned_message", pinned_message or "")
    frappe.db.commit()
    return {"ok": True}

@frappe.whitelist()
def get_pinned(session):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return frappe.db.get_value("AI Session", session, "pinned_message") or ""


@frappe.whitelist()
def transcribe_audio():
    """تفريغ مقطع صوتي مرفوع (multipart, حقل 'audio') إلى نص عبر Whisper API."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    from mubtkir_ai_creator.lib.transcription import transcribe

    file = frappe.request.files.get("audio")
    if not file:
        frappe.throw("لم يتم إرسال أي ملف صوتي")

    return {"text": transcribe(file.read(), file.filename or "audio.webm", file.mimetype or "audio/webm")}
