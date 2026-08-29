"""طبقة الاتصال بمواقع العملاء عبر Frappe REST API."""

import json

import frappe
import requests


class FrappeSiteClient:
    """عميل REST لموقع ERPNext واحد. تُنشأ نسخة fromه لكل عملية ومقفلة على site واحد."""

    def __init__(self, client_site_name):
        doc = frappe.get_doc("AI Client Site", client_site_name)
        if not doc.is_active:
            frappe.throw(f"العميل {client_site_name} غير مفعّل")

        creds = doc.get_credentials()
        if not creds.get("api_key") or not creds.get("api_secret"):
            frappe.throw(f"بيانات API غير مكتملة للعميل {client_site_name}")

        self.name = client_site_name
        self.site_url = creds["site_url"]
        self.timeout = frappe.db.get_single_value("AI Settings", "request_timeout") or 60
        self._headers = {
            "Authorization": f"token {creds['api_key']}:{creds['api_secret']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # ---------- الطبقة الدنيا ----------

    def _request(self, method, path, params=None, data=None):
        url = f"{self.site_url}{path}"
        try:
            resp = requests.request(
                method,
                url,
                headers=self._headers,
                params=params,
                data=json.dumps(data, ensure_ascii=False).encode("utf-8") if data else None,
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise ConnectionError(f"فشل الاتصال بـ {self.site_url}: {e}")

        if resp.status_code >= 400:
            raise RuntimeError(
                f"Response {resp.status_code} from {self.site_url}{path}: {resp.text[:500]}"
            )

        try:
            return resp.json()
        except ValueError:
            return {"raw": resp.text[:2000]}

    # ---------- عمليات القراءة ----------

    def ping(self):
        return self._request("GET", "/api/method/frappe.auth.get_logged_user")

    def get_versions(self):
        return self._request("GET", "/api/method/frappe.utils.change_log.get_versions")

    def get_meta(self, doctype):
        return self._request("GET", f"/api/resource/DocType/{doctype}")

    def get_doc(self, doctype, name):
        return self._request("GET", f"/api/resource/{doctype}/{name}")

    def get_list(self, doctype, fields=None, filters=None, limit=None, order_by=None):
        # الترتيب الافتراضي: الأحدث أولًا (creation desc) — لا يجوز ترك الترتيب
        # لتقدير النموذج، لأن API يرجع تصاعديًا افتراضيًا (الأقدم أولًا) وهو
        # عكس ما يفهمه أي مستخدم from طلب "آخر" أو "أحدث" المستندات
        if limit is None:
            from mubtkir_ai_creator.ai_creator.doctype.ai_settings.ai_settings import get_limits
            limit = get_limits()["client_get_list_default"]
        params = {"limit_page_length": limit, "order_by": order_by or "creation desc"}
        if fields:
            params["fields"] = json.dumps(fields)
        if filters:
            params["filters"] = json.dumps(filters)
        return self._request("GET", f"/api/resource/{doctype}", params=params)

    # ---------- عمليات الكتابة ----------

    def create_doc(self, doctype, data):
        return self._request("POST", f"/api/resource/{doctype}", data=data)

    def update_doc(self, doctype, name, data):
        return self._request("PUT", f"/api/resource/{doctype}/{name}", data=data)

    def delete_doc(self, doctype, name):
        return self._request("DELETE", f"/api/resource/{doctype}/{name}")

    def call_method(self, method, data=None):
        """استدعاء whitelisted method — للعمليات التي ليست CRUD (Submit/Cancel/Repost)."""
        return self._request("POST", f"/api/method/{method}", data=data or {})
