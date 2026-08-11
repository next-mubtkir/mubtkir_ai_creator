"""التقاط تخصيصات العميل وحفظها كقوالب قابلة لإعادة الاستخدام والتوثيق."""

import json

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib.client import FrappeSiteClient

# ما يمكن التقاطه، وهل يُسمح بنشره على عملاء آخرين
ARTIFACTS = {
    "Custom Field": {"doctype": "Custom Field", "deployable": True},
    "Property Setter": {"doctype": "Property Setter", "deployable": True},
    "Print Format": {"doctype": "Print Format", "deployable": True},
    "Client Script": {"doctype": "Client Script", "deployable": True},
    # Server Script: التقاط وتوثيق فقط — كود يعمل على سيرفر العميل، ونشره خطر
    "Server Script": {"doctype": "Server Script", "deployable": False},
}

STRIP_FIELDS = {
    "owner", "creation", "modified", "modified_by", "idx", "docstatus",
    "_user_tags", "_comments", "_assign", "_liked_by",
}


def list_available(client_site, artifact_type, target_doctype=None, limit=100):
    """استعراض ما يمكن التقاطه لدى العميل قبل الاختيار."""
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"نوع غير مدعوم: {artifact_type}")

    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS[artifact_type]["doctype"]

    field_map = {
        "Custom Field": (["name", "dt", "fieldname", "label", "fieldtype"], "dt"),
        "Property Setter": (["name", "doc_type", "field_name", "property", "value"], "doc_type"),
        "Print Format": (["name", "doc_type", "disabled"], "doc_type"),
        "Client Script": (["name", "dt", "script_type", "enabled"], "dt"),
        "Server Script": (["name", "script_type", "reference_doctype", "disabled"], "reference_doctype"),
    }
    fields, filter_key = field_map[artifact_type]
    filters = {filter_key: target_doctype} if target_doctype else None

    return client.get_list(doctype, fields=fields, filters=filters, limit=limit).get("data") or []


def capture(client_site, artifact_type, source_name, title=None, notes=None):
    """التقاط عنصر واحد وحفظه كـ AI Template بنسخة مؤرّخة."""
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"نوع غير مدعوم: {artifact_type}")

    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS[artifact_type]["doctype"]

    doc = client.get_doc(doctype, source_name).get("data") or {}
    if not doc:
        frappe.throw(f"لم يُعثر على «{source_name}» لدى العميل")

    payload = {k: v for k, v in doc.items() if k not in STRIP_FIELDS and v is not None}

    target_doctype = (
        doc.get("dt") or doc.get("doc_type") or doc.get("reference_doctype") or ""
    )

    # نسخة جديدة إن سبق التقاط نفس العنصر من نفس العميل
    previous = frappe.db.get_value(
        "AI Template",
        {"source_client": client_site, "artifact_type": artifact_type, "source_name": source_name},
        ["name", "version"],
        order_by="version desc",
        as_dict=True,
    )
    version = (previous.version + 1) if previous else 1

    tpl = frappe.get_doc({
        "doctype": "AI Template",
        "title": title or f"{artifact_type}: {source_name}",
        "artifact_type": artifact_type,
        "source_client": client_site,
        "source_name": source_name,
        "target_doctype": target_doctype,
        "payload": json.dumps(payload, ensure_ascii=False, indent=2),
        "version": version,
        "previous_version": previous.name if previous else None,
        "deployable": 1 if ARTIFACTS[artifact_type]["deployable"] else 0,
        "captured_on": now_datetime(),
        "notes": notes,
    })
    tpl.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"template": tpl.name, "version": version, "deployable": bool(tpl.deployable)}


def capture_all(client_site, target_doctype=None, artifact_types=None):
    """التقاط كل تخصيصات عميل دفعة واحدة (اختياريًا لـ DocType محدد)."""
    types = artifact_types or list(ARTIFACTS.keys())
    results, errors = [], []

    for artifact_type in types:
        try:
            items = list_available(client_site, artifact_type, target_doctype)
        except Exception as e:
            errors.append({"type": artifact_type, "error": str(e)[:300]})
            continue

        for item in items:
            try:
                res = capture(client_site, artifact_type, item.get("name"))
                results.append({"type": artifact_type, "name": item.get("name"), "template": res["template"]})
            except Exception as e:
                errors.append({"type": artifact_type, "name": item.get("name"), "error": str(e)[:300]})

    return {"captured": len(results), "items": results, "errors": errors}


@frappe.whitelist()
def run_capture(client_site, artifact_type, source_name, title=None, notes=None):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return capture(client_site, artifact_type, source_name, title, notes)


@frappe.whitelist()
def run_list_available(client_site, artifact_type, target_doctype=None):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return list_available(client_site, artifact_type, target_doctype)


@frappe.whitelist()
def run_capture_all(client_site, target_doctype=None):
    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    return capture_all(client_site, target_doctype)
