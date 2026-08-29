"""Capture client customizations and save them as reusable, versioned AI Templates."""

import json

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib.client import FrappeSiteClient
from mubtkir_ai_creator.ai_creator.doctype.ai_settings.ai_settings import get_limits

# ما يمكن التقاطه، وهل يُسمح بنشره على عملاء آخرين
ARTIFACTS = {
    "Custom Field": {"doctype": "Custom Field", "deployable": True},
    "Property Setter": {"doctype": "Property Setter", "deployable": True},
    "Print Format": {"doctype": "Print Format", "deployable": True},
    "Client Script": {"doctype": "Client Script", "deployable": True},
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


def list_available(client_site, artifact_type, target_doctype=None, limit=None):
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
    fields, filter_key = field_map.get(artifact_type, (["name"], None))
    filters = {filter_key: target_doctype} if target_doctype and filter_key else None

    effective_limit = limit or get_limits()["list_available_limit"]
    return client.get_list(doctype, fields=fields, filters=filters, limit=effective_limit).get("data") or []


def list_artifact_types(client_site):
    known = list(ARTIFACTS.keys())
    client = FrappeSiteClient(client_site)
    rows = client.get_list(
        "DocType",
        fields=["name"],
        filters={"istable": 0, "issingle": 0},
        limit=get_limits()["list_artifact_types_limit"],
        order_by="name asc",
    ).get("data") or []
    others = sorted({r.get("name") for r in rows if r.get("name") and r.get("name") not in known})
    return known + others


def capture(client_site, artifact_type, source_name, title=None, notes=None):
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"Unsupported type: {artifact_type}")

    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS[artifact_type]["doctype"]

    doc = client.get_doc(doctype, source_name).get("data") or {}
    if not doc:
        frappe.throw(f"Not found: {source_name}")

    payload = {k: v for k, v in doc.items() if k not in STRIP_FIELDS and v is not None}

    target_doctype = (
        doc.get("dt") or doc.get("doc_type") or doc.get("reference_doctype") or ""
    )

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


def capture_batch(client_site, artifact_type, source_names, title=None, notes=None):
    """Capture multiple items of the same type into a single AI Template."""
    if artifact_type not in ARTIFACTS:
        frappe.throw(f"Unsupported type: {artifact_type}")

    if not source_names:
        frappe.throw("No items selected")

    client = FrappeSiteClient(client_site)
    doctype = ARTIFACTS[artifact_type]["doctype"]

    items = []
    target_doctypes = set()

    for source_name in source_names:
        doc = client.get_doc(doctype, source_name).get("data") or {}
        if not doc:
            frappe.throw(f"Not found: {source_name}")

        payload = {k: v for k, v in doc.items() if k not in STRIP_FIELDS and v is not None}
        items.append({"source_name": source_name, "data": payload})

        td = doc.get("dt") or doc.get("doc_type") or doc.get("reference_doctype") or ""
        if td:
            target_doctypes.add(td)

    names_joined = ", ".join(source_names)
    batch_title = title or f"{artifact_type}: {len(source_names)} items"

    previous = frappe.db.get_value(
        "AI Template",
        {"source_client": client_site, "artifact_type": artifact_type, "source_name": ["like", "batch:%"]},
        ["name", "version"],
        order_by="version desc",
        as_dict=True,
    )
    version = (previous.version + 1) if previous else 1

    tpl = frappe.get_doc({
        "doctype": "AI Template",
        "title": batch_title,
        "artifact_type": artifact_type,
        "source_client": client_site,
        "source_name": f"batch: {names_joined}"[:140],
        "target_doctype": ", ".join(sorted(target_doctypes))[:140] if target_doctypes else "",
        "payload": json.dumps(items, ensure_ascii=False, indent=2),
        "version": version,
        "previous_version": previous.name if previous else None,
        "deployable": 1 if ARTIFACTS[artifact_type]["deployable"] else 0,
        "captured_on": now_datetime(),
        "notes": notes or f"Batch capture — {len(source_names)} items",
    })
    tpl.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"template": tpl.name, "version": version, "count": len(items), "deployable": bool(tpl.deployable)}


def capture_all(client_site, target_doctype=None, artifact_types=None):
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


# ======================== Whitelist API ========================

@frappe.whitelist()
def run_capture_batch(client_site, artifact_type, source_names):
    """Batch capture — single item uses normal capture, multiple items create one combined template."""
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    if isinstance(source_names, str):
        source_names = json.loads(source_names)
    if len(source_names) == 1:
        result = capture(client_site, artifact_type, source_names[0])
        result["count"] = 1
        return result
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
    frappe.only_for(["System Manager", "AI Creator User", "AI Creator Supervisor"])
    like = f"%{query}%"
    return frappe.get_all(
        "AI Template",
        or_filters={"title": ["like", like], "payload": ["like", like], "notes": ["like", like]},
        fields=["name", "title", "artifact_type", "source_client", "version", "captured_on"],
        order_by="captured_on desc",
        limit_page_length=min(int(limit), get_limits()["search_templates_limit"]),
    )
