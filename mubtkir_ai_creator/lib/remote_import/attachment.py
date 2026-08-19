"""Attachment Engine — upload and attach files to remote documents during import."""

import base64
import os

import frappe
import requests

from mubtkir_ai_creator.lib.client import FrappeSiteClient


def upload_attachment(client_site, doctype, docname, file_url=None, file_path=None, filename=None):
    """Upload a file to a remote document as an attachment.

    file_url: URL of file on the local site (under /files/)
    file_path: absolute path to a local file
    filename: override filename
    """
    doc = frappe.get_doc("AI Client Site", client_site)
    creds = doc.get_credentials()

    if file_url:
        local_path = frappe.get_site_path("public", file_url.lstrip("/"))
        if not os.path.exists(local_path):
            local_path = frappe.get_site_path(file_url.lstrip("/"))
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"الملف غير موجود: {file_url}")
        file_path = local_path
        filename = filename or os.path.basename(file_url)

    if not file_path or not os.path.exists(file_path):
        raise FileNotFoundError(f"الملف غير موجود: {file_path}")

    filename = filename or os.path.basename(file_path)

    with open(file_path, "rb") as f:
        file_content = f.read()

    # Upload via Frappe API
    url = f"{creds['site_url']}/api/method/upload_file"
    headers = {
        "Authorization": f"token {creds['api_key']}:{creds['api_secret']}",
    }

    files = {
        "file": (filename, file_content),
    }
    data = {
        "doctype": doctype,
        "docname": docname,
        "is_private": 1,
    }

    timeout = frappe.db.get_single_value("AI Settings", "request_timeout") or 120
    resp = requests.post(url, headers=headers, files=files, data=data, timeout=timeout)

    if resp.status_code >= 400:
        raise RuntimeError(f"فشل رفع المرفق: {resp.status_code} — {resp.text[:300]}")

    result = resp.json()
    return result.get("message", {})


def process_attachment_column(client_site, doctype, docname, attachment_value):
    """Process an attachment column value — could be a URL or file path.

    Returns the remote file URL after upload.
    """
    if not attachment_value:
        return None

    value = str(attachment_value).strip()

    # If it's already a remote URL (http/https), skip upload
    if value.startswith(("http://", "https://")):
        return value

    # If it's a local file reference
    if value.startswith("/files/") or value.startswith("/private/files/"):
        try:
            result = upload_attachment(client_site, doctype, docname, file_url=value)
            return result.get("file_url", value)
        except Exception as e:
            frappe.log_error(f"فشل رفع المرفق {value}: {e}", "AI Import Attachment")
            return value

    # If it's an absolute path
    if os.path.isabs(value) and os.path.exists(value):
        try:
            result = upload_attachment(client_site, doctype, docname, file_path=value)
            return result.get("file_url", value)
        except Exception as e:
            frappe.log_error(f"فشل رفع المرفق {value}: {e}", "AI Import Attachment")
            return value

    return value
