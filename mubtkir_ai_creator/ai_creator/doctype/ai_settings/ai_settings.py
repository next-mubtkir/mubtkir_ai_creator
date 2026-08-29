import frappe
from frappe.model.document import Document


class AISettings(Document):
    pass


def get_llm_config():
    """Return model settings with decrypted API key."""
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


def get_whisper_key():
    """Return decrypted OpenAI key for Whisper speech-to-text."""
    doc = frappe.get_single("AI Settings")
    key = doc.get_password("whisper_api_key", raise_exception=False)
    if not key:
        frappe.throw("لم يتم ضبط مفتاح OpenAI الخاص بالمايك (Whisper) في AI Settings")
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
    Each value falls back to its original default if the field is empty.
    """
    doc = frappe.get_single("AI Settings")
    return {
        # Agent Loop
        "max_agent_iterations": doc.max_agent_iterations or 8,

        # Output Truncation
        "tool_result_max_chars": doc.tool_result_max_chars or 8000,
        "log_truncation_limit": doc.log_truncation_limit or 20000,
        "error_message_limit": doc.error_message_limit or 1000,
        "error_display_limit": doc.error_display_limit or 500,
        "validation_error_limit": doc.validation_error_limit or 300,

        # List & Query Limits
        "list_documents_max_limit": doc.list_documents_max_limit or 100,
        "list_documents_default_limit": doc.list_documents_default_limit or 20,
        "client_get_list_default": doc.client_get_list_default or 20,
        "inspect_customizations_limit": doc.inspect_customizations_limit or 100,
        "diagnose_permissions_limit": doc.diagnose_permissions_limit or 100,
        "list_client_sites_limit": doc.list_client_sites_limit or 200,

        # Search Limits
        "find_document_name_limit": doc.find_document_name_limit or 5,
        "search_past_tasks_limit": doc.search_past_tasks_limit or 20,
        "search_templates_limit": doc.search_templates_limit or 50,
        "list_available_limit": doc.list_available_limit or 100,
        "list_artifact_types_limit": doc.list_artifact_types_limit or 1000,

        # Options Display
        "link_options_limit": doc.link_options_limit or 50,
        "available_options_shown": doc.available_options_shown or 15,
        "select_options_shown": doc.select_options_shown or 15,
    }
