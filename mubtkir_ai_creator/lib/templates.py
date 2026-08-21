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
    "Custom HTML Block": {"doctype": "Custom HTML Block", "deployable": True},
    "Workspace": {"doctype": "Workspace", "deployable": True},
    "Item": {"doctype": "Item", "deployable": True},
    "Customer": {"doctype": "Customer", "deployable": True},
    "Supplier": {"doctype": "Supplier", "deployable": True},
}

STRIP_FIELDS = {
    "owner", "creation", "modified", "modified_by", "idx", "docstatus",
    "_user_tags", "_comments", "_assign", "_liked_by",
}


def list_available(client_site, artifact_type, target_doctype=None, limit=100):
    """استعراض ما يمكن التقاطه لدى العميل قبل الاختيار."""
    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS.get(artifact_type, {}).get("doctype", artifact_type)

    field_map = {
        "Custom Field": (["name", "dt", "fieldname", "label", "fieldtype"], "dt"),
        "Property Setter": (["name", "doc_type", "field_name", "property", "value"], "doc_type"),
        "Print Format": (["name", "doc_type", "disabled"], "doc_type"),
        "Client Script": (["name", "dt", "script_type", "enabled"], "dt"),
        "Server Script": (["name", "script_type", "reference_doctype", "disabled"], "reference_doctype"),
        "Custom HTML Block": (["name", "html", "private", "modified"], None),
        "Workspace": (["name", "label", "module", "public"], None),
        "Item": (["name", "item_code", "item_name", "item_group", "disabled"], "item_group"),
        "Customer": (["name", "customer_name", "customer_group", "disabled"], "customer_group"),
        "Supplier": (["name", "supplier_name", "supplier_group", "disabled"], "supplier_group"),
    }
    # أي DocType آخر لم يُدرج أعلاه: عرض الاسم فقط بلا حصر إضافي
    fields, filter_key = field_map.get(artifact_type, (["name"], None))
    filters = {filter_key: target_doctype} if target_doctype and filter_key else None

    return client.get_list(doctype, fields=fields, filters=filters, limit=limit).get("data") or []


def list_artifact_types(client_site):
    """الأنواع الخاصة المعروفة أولًا، ثم كل DocTypes الموجودة فعليًا لدى هذا العميل — لتعبئة قائمة الاختيار بالكامل."""
    known = list(ARTIFACTS.keys())
    client = FrappeSiteClient(client_site)
    rows = client.get_list(
        "DocType",
        fields=["name"],
        filters={"istable": 0, "issingle": 0},
        limit=1000,
        order_by="name asc",
    ).get("data") or []
    others = sorted({r.get("name") for r in rows if r.get("name") and r.get("name") not in known})
    return known + others


def capture(client_site, artifact_type, source_name, title=None, notes=None):
    """التقاط عنصر واحد وحفظه كـ AI Template بنسخة مؤرّخة."""
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"Unsupported type: {artifact_type}")

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
    """Capture all customizations from a client in ONE template per type."""
    types = artifact_types or list(ARTIFACTS.keys())
    results, errors = [], []

    for artifact_type in types:
        try:
            items = list_available(client_site, artifact_type, target_doctype)
        except Exception as e:
            errors.append({"type": artifact_type, "error": str(e)[:300]})
            continue

        if not items:
            continue

        names = [item.get("name") for item in items if item.get("name")]
        if names:
            try:
                res = capture_batch(client_site, artifact_type, names)
                results.append({"type": artifact_type, "count": len(names), "template": res["template"]})
            except Exception as e:
                errors.append({"type": artifact_type, "error": str(e)[:300]})

    return {"captured": len(results), "items": results, "errors": errors}


def capture_batch(client_site, artifact_type, source_names, title=None, notes=None):
    """Capture multiple items of the same type into ONE AI Template.

    source_names: list of document names to capture together.
    The payload becomes a list of payloads instead of a single object.
    """
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"Unsupported type: {artifact_type}")

    if not source_names or not isinstance(source_names, (list, tuple)):
        frappe.throw("source_names must be a non-empty list")

    # If only one item, delegate to single capture
    if len(source_names) == 1:
        return capture(client_site, artifact_type, source_names[0], title, notes)

    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS[artifact_type]["doctype"]

    payloads = []
    captured_names = []
    target_doctype = ""

    for name in source_names:
        try:
            doc = client.get_doc(doctype, name).get("data") or {}
            if not doc:
                continue
            payload = {k: v for k, v in doc.items() if k not in STRIP_FIELDS and v is not None}
            payloads.append(payload)
            captured_names.append(name)
            if not target_doctype:
                target_doctype = doc.get("dt") or doc.get("doc_type") or doc.get("reference_doctype") or ""
        except Exception:
            continue

    if not payloads:
        frappe.throw("No items could be captured")

    # Version tracking based on client + type combo
    names_key = ", ".join(sorted(captured_names))
    auto_title = title or f"{artifact_type}: {len(captured_names)} items"

    previous = frappe.db.get_value(
        "AI Template",
        {"source_client": client_site, "artifact_type": artifact_type, "title": auto_title},
        ["name", "version"],
        order_by="version desc",
        as_dict=True,
    )
    version = (previous.version + 1) if previous else 1

    tpl = frappe.get_doc({
        "doctype": "AI Template",
        "title": auto_title,
        "artifact_type": artifact_type,
        "source_client": client_site,
        "source_name": names_key[:140],
        "target_doctype": target_doctype,
        "payload": json.dumps(payloads, ensure_ascii=False, indent=2),
        "version": version,
        "previous_version": previous.name if previous else None,
        "deployable": 1 if ARTIFACTS[artifact_type]["deployable"] else 0,
        "captured_on": now_datetime(),
        "notes": notes or f"Batch capture: {', '.join(captured_names)}",
    })
    tpl.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"template": tpl.name, "version": version, "count": len(captured_names), "names": captured_names}


@frappe.whitelist()
def run_capture_batch(client_site, artifact_type, source_names):
    """Whitelisted wrapper for capture_batch."""
    frappe.only_for(["System Manager", "AI Creator Supervisor", "AI Creator User"])
    if isinstance(source_names, str):
        source_names = json.loads(source_names)
    return capture_batch(client_site, artifact_type, source_names)


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


@frappe.whitelist()
def run_list_artifact_types(client_site):
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    return list_artifact_types(client_site)


@frappe.whitelist()
def search_templates(query, limit=20):
    """بحث نصي كامل بعنوان القالب أو محتواه (JSON) أو ملاحظاته — مو بالعنوان فقط."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    like = f"%{query}%"
    return frappe.get_all(
        "AI Template",
        or_filters={"title": ["like", like], "payload": ["like", like], "notes": ["like", like]},
        fields=["name", "title", "artifact_type", "source_client", "version", "captured_on"],
        order_by="captured_on desc",
        limit_page_length=min(int(limit), 50),
    )
