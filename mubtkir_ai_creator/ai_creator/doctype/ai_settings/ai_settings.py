import frappe
from frappe.model.document import Document


# Minimum allowed value for each limit field = the original hardcoded defaults
LIMIT_DEFAULTS = {
    # Agent Loop
    "max_agent_iterations": 8,
    # Output Truncation
    "tool_result_max_chars": 8000,
    "log_truncation_limit": 20000,
    "error_message_limit": 1000,
    "error_display_limit": 500,
    "validation_error_limit": 300,
    # List & Query Limits
    "list_documents_max_limit": 100,
    "list_documents_default_limit": 20,
    "client_get_list_default": 20,
    "inspect_customizations_limit": 100,
    "diagnose_permissions_limit": 100,
    "list_client_sites_limit": 200,
    # Search Limits
    "find_document_name_limit": 5,
    "search_past_tasks_limit": 20,
    "search_templates_limit": 50,
    "list_available_limit": 100,
    "list_artifact_types_limit": 1000,
    # Options Display
    "link_options_limit": 50,
    "available_options_shown": 15,
    "select_options_shown": 15,
}


class AISettings(Document):
    def validate(self):
        """Enforce minimum values — no field can go below its original default."""
        for field, minimum in LIMIT_DEFAULTS.items():
            value = self.get(field)
            if not value or value < minimum:
                self.set(field, minimum)

    def before_save(self):
        """Fill empty/zero fields with their defaults on first save."""
        for field, default in LIMIT_DEFAULTS.items():
            if not self.get(field):
                self.set(field, default)


def get_llm_config():
    """Return model settings with decrypted API key."""
    doc = frappe.get_single("AI Settings")
    key = doc.get_password("api_key", raise_exception=False)
    if not key and doc.llm_provider != "Ollama":
        frappe.throw("LLM API Key is not configured in AI Settings")
    return {
        "provider": doc.llm_provider or "Anthropic",
        "model": doc.model,
        "base_url": doc.base_url,
        "api_key": key,
        "max_tokens": doc.max_tokens or 4096,
        "timeout": doc.request_timeout or 60,
        "heavy_model": doc.heavy_model,
    }


def get_whisper_key():
    """Return decrypted OpenAI key for Whisper speech-to-text."""
    doc = frappe.get_single("AI Settings")
    key = doc.get_password("whisper_api_key", raise_exception=False)
    if not key:
        frappe.throw("OpenAI Whisper API Key is not configured in AI Settings")
    return key


def get_attachment_limits():
    doc = frappe.get_single("AI Settings")
    return {
        "max_rows": doc.max_rows_per_sheet or 200,
        "max_chars": doc.max_text_chars or 30000,
    }


def get_limits():
    """Return all configurable limits from AI Settings.

    Every caller reads from here instead of hardcoding numbers.
    Each value falls back to its minimum default if the field is empty or zero.
    """
    doc = frappe.get_single("AI Settings")
    return {
        field: getattr(doc, field, None) or default
        for field, default in LIMIT_DEFAULTS.items()
    }
