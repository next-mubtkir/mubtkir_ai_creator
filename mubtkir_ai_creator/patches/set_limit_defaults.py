"""Set default values for new Limits fields on existing AI Settings record."""

import frappe


def execute():
    defaults = {
        "max_agent_iterations": 8,
        "tool_result_max_chars": 8000,
        "log_truncation_limit": 20000,
        "error_message_limit": 1000,
        "error_display_limit": 500,
        "validation_error_limit": 300,
        "list_documents_max_limit": 100,
        "list_documents_default_limit": 20,
        "client_get_list_default": 20,
        "inspect_customizations_limit": 100,
        "diagnose_permissions_limit": 100,
        "list_client_sites_limit": 200,
        "find_document_name_limit": 5,
        "search_past_tasks_limit": 20,
        "search_templates_limit": 50,
        "list_available_limit": 100,
        "list_artifact_types_limit": 1000,
        "link_options_limit": 50,
        "available_options_shown": 15,
        "select_options_shown": 15,
    }

    doc = frappe.get_single("AI Settings")
    for field, value in defaults.items():
        if not doc.get(field):
            doc.db_set(field, value, update_modified=False)

    frappe.db.commit()
