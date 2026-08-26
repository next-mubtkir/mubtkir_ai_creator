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
    """Get full metadata for a remote DocType including all fields, child tables, and Arabic translations."""
    client = get_client(client_site)
    resp = client.get_meta(doctype)
    data = resp.get("data", {})

    # Fetch Arabic translations for field labels
    translations = _fetch_translations(client, doctype, data.get("fields", []))

    fields = data.get("fields", [])
    parent_fields = []
    child_tables = {}

    for f in fields:
        label = f.get("label") or ""
        translated = translations.get(label, "")
        field_info = {
            "fieldname": f.get("fieldname"),
            "fieldtype": f.get("fieldtype"),
            "label": label,
            "translated_label": translated,
            "display_label": translated or label,  # Arabic first, fallback English
            "reqd": f.get("reqd", 0),
            "mandatory_depends_on": f.get("mandatory_depends_on", ""),
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
                    child_fields = _fetch_child_fields(client, child_dt)
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


def _fetch_child_fields(client, child_dt):
    """Fetch all fields for a child doctype.

    Uses get_meta first, then falls back to querying DocField directly
    to ensure ALL fields are returned (get_meta sometimes omits
    read_only / fetch_from / hidden fields).
    """
    child_fields = []
    seen = set()

    # Primary: get_meta
    try:
        child_resp = client.get_meta(child_dt)
        child_data = child_resp.get("data", {})
        for cf in child_data.get("fields", []):
            if cf.get("fieldtype") in _SKIPPED_FIELDTYPES:
                continue
            fn = cf.get("fieldname")
            if fn and fn not in seen:
                seen.add(fn)
                child_fields.append({
                    "fieldname": fn,
                    "fieldtype": cf.get("fieldtype"),
                    "label": cf.get("label"),
                    "reqd": cf.get("reqd", 0),
                    "mandatory_depends_on": cf.get("mandatory_depends_on", ""),
                    "options": cf.get("options"),
                    "is_custom_field": cf.get("is_custom_field", 0),
                })
    except Exception:
        pass

    # Fallback: query DocField table directly for any missing fields
    try:
        doc_fields = client.get_list(
            "DocField",
            filters={"parent": child_dt, "fieldtype": ["not in", list(_SKIPPED_FIELDTYPES)]},
            fields=["fieldname", "fieldtype", "label", "reqd", "options", "is_custom_field", "mandatory_depends_on"],
            limit_page_length=0,
        )
        for cf in doc_fields:
            fn = cf.get("fieldname")
            if fn and fn not in seen:
                seen.add(fn)
                child_fields.append({
                    "fieldname": fn,
                    "fieldtype": cf.get("fieldtype"),
                    "label": cf.get("label"),
                    "reqd": cf.get("reqd", 0),
                    "mandatory_depends_on": cf.get("mandatory_depends_on", ""),
                    "options": cf.get("options"),
                    "is_custom_field": cf.get("is_custom_field", 0),
                })
    except Exception:
        pass

    return child_fields


def _fetch_translations(client, doctype, fields):
    """Fetch Arabic translations for field labels from the remote site.

    Returns dict: {english_label: arabic_translation}
    """
    translations = {}
    labels = [f.get("label") for f in fields if f.get("label")]
    if not labels:
        return translations

    try:
        # Fetch translations for "ar" language
        resp = client.get_list(
            "Translation",
            fields=["source_text", "translated_text"],
            filters=[
                ["language", "=", "ar"],
                ["source_text", "in", labels],
            ],
            limit=500,
        )
        for row in resp.get("data", []):
            src = row.get("source_text", "")
            tr = row.get("translated_text", "")
            if src and tr:
                translations[src] = tr
    except Exception:
        # Translation fetch is best-effort — don't break if it fails
        pass

    return translations
