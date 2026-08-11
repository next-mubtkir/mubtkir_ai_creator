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
    """مهمة مجدولة: فحص كل المواقع المفعّلة."""
    for name in frappe.get_all("AI Client Site", filters={"is_active": 1}, pluck="name"):
        try:
            check_site(name)
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"AI Creator ping failed: {name}")
