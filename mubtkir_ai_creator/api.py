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
def start_session(client_site, title=None):
    """بدء جلسة مقفلة على عميل واحد."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    doc = frappe.get_doc({
        "doctype": "AI Session",
        "client_site": client_site,
        "title": title or f"جلسة {client_site}",
    })
    doc.insert()
    frappe.db.commit()
    return {"session": doc.name, "client_site": doc.client_site}


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
def list_recent_sessions(client_site=None, limit=30):
    """قائمة الجلسات السابقة لاستعراضها ومتابعتها لاحقًا."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    filters = {"session_user": frappe.session.user}
    if client_site:
        filters["client_site"] = client_site

    rows = frappe.get_all(
        "AI Session",
        filters=filters,
        fields=["name", "title", "client_site", "status", "started_on", "ended_on", "modified"],
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
