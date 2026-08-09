import frappe
from frappe.model.document import Document


class AIClientSite(Document):
    def validate(self):
        if self.site_url:
            self.site_url = self.site_url.strip().rstrip("/")
            if not self.site_url.startswith("https://"):
                frappe.throw("رابط الموقع يجب أن يبدأ بـ https:// فقط")

    def get_credentials(self):
        """إرجاع بيانات الاتصال بعد فك التشفير. لا تُعاد أبدًا للواجهة أو للنموذج."""
        return {
            "site_url": self.site_url,
            "api_key": self.get_password("api_key", raise_exception=False),
            "api_secret": self.get_password("api_secret", raise_exception=False),
        }


@frappe.whitelist()
def test_connection(name):
    """فحص الاتصال بموقع العميل وتحديث حالته."""
    from mubtkir_ai_creator.lib.connection import check_site

    frappe.only_for(["System Manager", "AI Creator User"])
    return check_site(name)
