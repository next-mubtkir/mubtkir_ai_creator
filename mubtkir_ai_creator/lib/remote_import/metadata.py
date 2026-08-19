"""Metadata Service — remote DocType discovery, field metadata, child tables."""

import frappe

from mubtkir_ai_creator.lib.remote_import.connection import get_client


def discover_doctypes(client_site, search_term=None):
    """List available DocTypes on the remote site."""
    client = get_client(client_site)
    filters = [["istable", "=", 0], ["issingle", "=", 0]]
    if search_term:
        filters.append(["name", "like", f"%{search_term}%"])

    resp = client.get_list(
        "DocType",
        fields=["name", "module", "is_submittable"],
        filters=filters,
        limit=200,
        order_by="name asc",
    )
    return resp.get("data", [])


def get_doctype_meta(client_site, doctype):
    """Get full metadata for a remote DocType including all fields and child tables."""
    client = get_client(client_site)
    resp = client.get_meta(doctype)
    data = resp.get("data", {})

    fields = data.get("fields", [])
    parent_fields = []
    child_tables = {}

    for f in fields:
        field_info = {
            "fieldname": f.get("fieldname"),
            "fieldtype": f.get("fieldtype"),
            "label": f.get("label"),
            "reqd": f.get("reqd", 0),
            "options": f.get("options"),
            "default": f.get("default"),
            "is_custom_field": f.get("is_custom_field", 0),
            "in_list_view": f.get("in_list_view", 0),
        }

        if f.get("fieldtype") == "Table":
            # Fetch child table meta
            child_dt = f.get("options")
            if child_dt:
                try:
                    child_resp = client.get_meta(child_dt)
                    child_data = child_resp.get("data", {})
                    child_fields = []
                    for cf in child_data.get("fields", []):
                        if cf.get("fieldtype") in _SKIPPED_FIELDTYPES:
                            continue
                        child_fields.append({
                            "fieldname": cf.get("fieldname"),
                            "fieldtype": cf.get("fieldtype"),
                            "label": cf.get("label"),
                            "reqd": cf.get("reqd", 0),
                            "options": cf.get("options"),
                            "is_custom_field": cf.get("is_custom_field", 0),
                        })
                    child_tables[f.get("fieldname")] = {
                        "doctype": child_dt,
                        "fieldname": f.get("fieldname"),
                        "label": f.get("label"),
                        "fields": child_fields,
                    }
                except Exception:
                    child_tables[f.get("fieldname")] = {
                        "doctype": child_dt,
                        "fieldname": f.get("fieldname"),
                        "label": f.get("label"),
                        "fields": [],
                        "error": "Could not fetch child table metadata",
                    }
        elif f.get("fieldtype") not in _SKIPPED_FIELDTYPES:
            parent_fields.append(field_info)

    return {
        "doctype": doctype,
        "module": data.get("module"),
        "is_submittable": data.get("is_submittable", 0),
        "autoname": data.get("autoname"),
        "name_case": data.get("name_case"),
        "fields": parent_fields,
        "child_tables": child_tables,
        "has_custom_fields": any(f.get("is_custom_field") for f in parent_fields),
    }


def get_required_fields(client_site, doctype):
    """Return only required fields for a doctype."""
    meta = get_doctype_meta(client_site, doctype)
    required = [f for f in meta["fields"] if f.get("reqd")]
    return {
        "doctype": doctype,
        "required_fields": required,
        "child_tables": {
            k: {
                **v,
                "fields": [cf for cf in v["fields"] if cf.get("reqd")],
            }
            for k, v in meta["child_tables"].items()
        },
    }


# Fieldtypes to skip (layout/display only)
_SKIPPED_FIELDTYPES = {
    "Section Break", "Column Break", "Tab Break", "Fold",
    "Heading", "HTML", "Button", "Image",
}
