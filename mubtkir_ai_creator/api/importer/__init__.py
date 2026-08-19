"""Whitelisted API endpoints for the Remote AI Import Engine.

All endpoints are accessible at:
  /api/method/mubtkir_ai_creator.api.importer.<function_name>
"""

import json

import frappe


_ALLOWED_ROLES = ["System Manager", "AI Creator Supervisor", "AI Creator User"]


def _check_permission():
    frappe.only_for(_ALLOWED_ROLES)


# ─── Connection ───

@frappe.whitelist()
def test_connection(client_site):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.connection import test_connection as _test
    return _test(client_site)


# ─── Metadata ───

@frappe.whitelist()
def discover_doctypes(client_site, search_term=None):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.metadata import discover_doctypes as _discover
    return _discover(client_site, search_term)


@frappe.whitelist()
def get_doctype_meta(client_site, doctype):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.metadata import get_doctype_meta as _meta
    return _meta(client_site, doctype)


@frappe.whitelist()
def get_required_fields(client_site, doctype):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.metadata import get_required_fields as _req
    return _req(client_site, doctype)


# ─── Template ───

@frappe.whitelist()
def get_template(client_site, doctype):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.template import generate_template
    return generate_template(client_site, doctype)


@frappe.whitelist()
def download_template(client_site, doctype):
    """Download an Excel import template."""
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.template import download_template_excel

    content = download_template_excel(client_site, doctype)
    filename = f"{doctype}_import_template.xlsx"

    frappe.response["filename"] = filename
    frappe.response["filecontent"] = content
    frappe.response["type"] = "binary"


# ─── Google Sheets ───

@frappe.whitelist()
def preview_google_sheet(url, limit=20):
    """Preview data from a public Google Sheet."""
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.preview import parse_google_sheet
    result = parse_google_sheet(url)
    return {
        "headers": result["headers"],
        "rows": result["rows"][:int(limit)],
        "total_rows": result["total_rows"],
        "file_name": result["file_name"],
        "file_type": "google_sheet",
        "preview_rows": min(int(limit), result["total_rows"]),
    }


# ─── Mapping ───

@frappe.whitelist()
def auto_map(client_site, doctype, file_columns):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.mapping import auto_map as _auto
    if isinstance(file_columns, str):
        file_columns = json.loads(file_columns)
    return _auto(client_site, doctype, file_columns)


@frappe.whitelist()
def save_mapping(mapping_title, client_site, doctype, mapping_data, is_default=0, notes=""):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.mapping import save_mapping as _save
    if isinstance(mapping_data, str):
        mapping_data = json.loads(mapping_data)
    return _save(mapping_title, client_site, doctype, mapping_data, int(is_default), notes)


@frappe.whitelist()
def load_mapping(mapping_name):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.mapping import load_mapping as _load
    return _load(mapping_name)


@frappe.whitelist()
def list_mappings(client_site=None, doctype=None):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.mapping import list_mappings as _list
    return _list(client_site, doctype)


@frappe.whitelist()
def get_unmapped_required(client_site, doctype, current_mapping):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.mapping import get_unmapped_required as _unmapped
    if isinstance(current_mapping, str):
        current_mapping = json.loads(current_mapping)
    return _unmapped(client_site, doctype, current_mapping)


# ─── Preview ───

@frappe.whitelist()
def preview_file(file_url, limit=20):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.preview import preview_data
    return preview_data(file_url, int(limit))


@frappe.whitelist()
def validate_data(file_url, mapping, client_site, doctype):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.preview import validate_data as _validate
    return _validate(file_url, mapping, client_site, doctype)


# ─── Import Execution ───

@frappe.whitelist()
def start_import(import_name):
    """Start an import (foreground or background based on settings)."""
    _check_permission()
    doc = frappe.get_doc("AI Remote Import", import_name)

    if doc.status in ("Running", "Queued"):
        frappe.throw("الاستيراد قيد التنفيذ بالفعل")

    if doc.run_as_background_job:
        from mubtkir_ai_creator.lib.remote_import.queue import enqueue_import
        return enqueue_import(import_name)
    else:
        from mubtkir_ai_creator.lib.remote_import.importer import run_import
        return run_import(import_name)


@frappe.whitelist()
def cancel_import(import_name):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.queue import cancel_import as _cancel
    return _cancel(import_name)


@frappe.whitelist()
def get_import_status(import_name):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.queue import get_import_status as _status
    return _status(import_name)


# ─── Resume / Retry ───

@frappe.whitelist()
def resume_import(import_name):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.resume import resume_import as _resume
    return _resume(import_name)


@frappe.whitelist()
def retry_failed_rows(import_name):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.resume import retry_failed_rows as _retry
    return _retry(import_name)


# ─── Dashboard / Logs ───

@frappe.whitelist()
def get_dashboard():
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.log import get_dashboard_stats
    return get_dashboard_stats()


@frappe.whitelist()
def get_import_history(client_site=None, doctype=None, status=None, limit=50):
    _check_permission()
    from mubtkir_ai_creator.lib.remote_import.log import get_import_history as _history
    return _history(client_site, doctype, status, int(limit))


# ─── Clients (convenience) ───

@frappe.whitelist()
def get_clients():
    _check_permission()
    return frappe.get_all(
        "AI Client Site",
        filters={"is_active": 1},
        fields=["name", "client_name", "site_url", "status", "erpnext_version"],
        order_by="client_name asc",
    )
