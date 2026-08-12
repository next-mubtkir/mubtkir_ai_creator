import frappe
from frappe.model.document import Document


class AISettings(Document):
    pass


def get_llm_config():
    """إرجاع إعدادات النموذج مع فك تشفير المفتاح."""
    doc = frappe.get_single("AI Settings")
    key = doc.get_password("api_key", raise_exception=False)
    if not key and doc.llm_provider != "Ollama":
        frappe.throw("لم يتم ضبط مفتاح API للنموذج في AI Settings")
    return {
        "provider": doc.llm_provider or "Anthropic",
        "model": doc.model,
        "base_url": doc.base_url,
        "api_key": key,
        "max_tokens": doc.max_tokens or 4096,
        "timeout": doc.request_timeout or 60,
        "heavy_model": doc.heavy_model,
    }


def get_attachment_limits():
    doc = frappe.get_single("AI Settings")
    return {
        "max_rows": doc.max_rows_per_sheet or 200,
        "max_chars": doc.max_text_chars or 30000,
    }
