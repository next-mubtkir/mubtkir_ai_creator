"""فحص حالة الاتصال بمواقع العملاء."""

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib.client import FrappeSiteClient


def check_site(client_site_name):
    doc = frappe.get_doc("AI Client Site", client_site_name)
    try:
        client = FrappeSiteClient(client_site_name)
        user = client.ping().get("message")
        versions = {}
        try:
            versions = client.get_versions().get("message", {}) or {}
        except Exception:
            pass

        doc.db_set("status", "Connected")
        doc.db_set("api_user", user or doc.api_user)
        doc.db_set("erpnext_version", (versions.get("erpnext") or {}).get("version"))
        doc.db_set("frappe_version", (versions.get("frappe") or {}).get("version"))
        doc.db_set("last_error", None)
        doc.db_set("last_connection_check", now_datetime())
        return {"status": "Connected", "user": user}
    except Exception as e:
        doc.db_set("status", "Failed")
        doc.db_set("last_error", str(e)[:1000])
        doc.db_set("last_connection_check", now_datetime())
        return {"status": "Failed", "error": str(e)}


def ping_all_sites():
    """مهمة مجدولة: فحص كل المواقع المفعّلة + تنبيه عند فشل متكرر."""
    failed_sites = []
    for name in frappe.get_all("AI Client Site", filters={"is_active": 1}, pluck="name"):
        try:
            result = check_site(name)
            if result.get("status") == "Failed":
                failed_sites.append({"site": name, "error": result.get("error", "")[:200]})
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"AI Creator ping failed: {name}")
            failed_sites.append({"site": name, "error": "exception during ping"})

    if failed_sites:
        _send_connection_alert(failed_sites)


def _send_connection_alert(failed_sites):
    """إرسال تنبيه للمشرفين عند فشل اتصال عميل أو أكثر."""
    lines = [f"⚠ فشل الاتصال بـ {len(failed_sites)} موقع عميل:\n"]
    for s in failed_sites:
        lines.append(f"• {s['site']}: {s['error']}")
    body = "\n".join(lines)

    supervisors = frappe.get_all(
        "Has Role",
        filters={"role": ["in", ["AI Creator Supervisor", "System Manager"]], "parenttype": "User"},
        fields=["parent"],
        distinct=True,
    )
    recipients = list({r.parent for r in supervisors if r.parent and "@" in r.parent})

    if not recipients:
        frappe.log_error(body, "AI Creator: connection alert — no recipients")
        return

    try:
        frappe.sendmail(
            recipients=recipients[:10],
            subject=f"AI Creator — فشل اتصال {len(failed_sites)} عميل",
            message=f"<pre dir='rtl'>{frappe.utils.escape_html(body)}</pre>",
            now=True,
        )
    except Exception:
        frappe.log_error(body, "AI Creator: connection alert email failed")
