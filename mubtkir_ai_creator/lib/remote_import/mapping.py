"""Mapping Engine — intelligent field mapping with save/load support."""

import json
import re
from difflib import SequenceMatcher

import frappe

from mubtkir_ai_creator.lib.remote_import.metadata import get_doctype_meta


def _normalize_arabic(text):
    """Normalize Arabic text for fuzzy matching.

    Removes ال التعريف, normalizes ة→ه, أإآ→ا, strips tashkeel.
    """
    if not text:
        return ""
    t = text.lower().strip()
    # Remove tashkeel (diacritics)
    t = re.sub(r'[\u064B-\u065F\u0670]', '', t)
    # Normalize hamza variants
    t = re.sub(r'[أإآ]', 'ا', t)
    # Normalize taa marbuta
    t = t.replace('ة', 'ه')
    # Remove ال التعريف at start
    t = re.sub(r'^ال', '', t)
    # Remove common prefixes/suffixes for matching
    t = t.strip()
    return t


def auto_map(client_site, doctype, file_columns):
    """Auto-map file columns to remote DocType fields.

    Uses: exact match → translated label → normalized Arabic → fuzzy matching.
    Returns a dict: {file_column: remote_fieldname or None}
    """
    meta = get_doctype_meta(client_site, doctype)

    # Build lookups
    by_name = {}       # fieldname → fieldname
    by_label = {}      # label (lower) → fieldname
    by_translated = {} # translated label (lower) → fieldname
    by_normalized = {} # normalized arabic → fieldname

    for f in meta["fields"]:
        fn = f["fieldname"]
        by_name[fn.lower()] = fn

        label = (f.get("label") or "").lower().strip()
        if label:
            by_label[label] = fn
            by_normalized[_normalize_arabic(label)] = fn

        # Use translated labels if available
        tr = (f.get("translated_label") or "").lower().strip()
        if tr:
            by_translated[tr] = fn
            by_normalized[_normalize_arabic(tr)] = fn

    # Also include child table fields
    for table_fn, table_info in meta.get("child_tables", {}).items():
        for cf in table_info["fields"]:
            prefixed = f"{table_fn}.{cf['fieldname']}"
            by_name[prefixed.lower()] = prefixed
            label = (cf.get("label") or "").lower().strip()
            if label:
                key = f"{table_info.get('label', table_fn)}.{label}".lower()
                by_label[key] = prefixed

    mapping = {}
    used = set()

    for col in file_columns:
        col_lower = col.lower().strip()
        col_norm = _normalize_arabic(col)
        matched = None

        # 1. Exact fieldname match
        if col_lower in by_name and by_name[col_lower] not in used:
            matched = by_name[col_lower]

        # 2. Exact label match
        if not matched and col_lower in by_label and by_label[col_lower] not in used:
            matched = by_label[col_lower]

        # 3. Translated label match
        if not matched and col_lower in by_translated and by_translated[col_lower] not in used:
            matched = by_translated[col_lower]

        # 4. Normalized Arabic match (handles ال, ة, أ variations)
        if not matched and col_norm and col_norm in by_normalized and by_normalized[col_norm] not in used:
            matched = by_normalized[col_norm]

        # 5. Fuzzy match (threshold 0.6 — lower for Arabic)
        if not matched:
            best_score = 0
            best_fn = None
            all_candidates = (
                list(by_name.items()) + list(by_label.items()) +
                list(by_translated.items()) + list(by_normalized.items())
            )
            for key, fn in all_candidates:
                if fn in used:
                    continue
                # Try both raw and normalized
                score = max(
                    SequenceMatcher(None, col_lower, key).ratio(),
                    SequenceMatcher(None, col_norm, _normalize_arabic(key)).ratio() if col_norm else 0,
                )
                if score > best_score and score >= 0.6:
                    best_score = score
                    best_fn = fn
            if best_fn:
                matched = best_fn

        mapping[col] = matched
        if matched:
            used.add(matched)

    return mapping


def get_unmapped_required(client_site, doctype, current_mapping):
    """Check which required fields are not yet mapped."""
    meta = get_doctype_meta(client_site, doctype)
    mapped_fields = set(v for v in current_mapping.values() if v)

    unmapped = []
    for f in meta["fields"]:
        is_required = f.get("reqd")
        is_conditional = f.get("mandatory_depends_on")
        if (is_required or is_conditional) and f["fieldname"] not in mapped_fields and f["fieldname"] != "name":
            unmapped.append({
                "fieldname": f["fieldname"],
                "label": f.get("label", f["fieldname"]),
                "fieldtype": f["fieldtype"],
                "conditional": bool(is_conditional and not is_required),
            })

    return unmapped


def save_mapping(mapping_title, client_site, doctype, mapping_data, is_default=False, notes=""):
    """Save a mapping for reuse."""
    if frappe.db.exists("AI Import Mapping", mapping_title):
        doc = frappe.get_doc("AI Import Mapping", mapping_title)
        doc.mapping_data = json.dumps(mapping_data, ensure_ascii=False)
        doc.notes = notes
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({
            "doctype": "AI Import Mapping",
            "mapping_title": mapping_title,
            "client_site": client_site,
            "remote_doctype": doctype,
            "mapping_data": json.dumps(mapping_data, ensure_ascii=False),
            "is_default": 1 if is_default else 0,
            "notes": notes,
        })
        doc.insert(ignore_permissions=True)

    if is_default:
        # Unset other defaults for same doctype
        frappe.db.sql("""
            UPDATE `tabAI Import Mapping`
            SET is_default = 0
            WHERE remote_doctype = %s AND name != %s
        """, (doctype, doc.name))

    frappe.db.commit()
    return doc.name


def load_mapping(mapping_name):
    """Load a saved mapping."""
    doc = frappe.get_doc("AI Import Mapping", mapping_name)
    return {
        "name": doc.name,
        "mapping_title": doc.mapping_title,
        "client_site": doc.client_site,
        "remote_doctype": doc.remote_doctype,
        "mapping_data": json.loads(doc.mapping_data or "{}"),
        "is_default": doc.is_default,
        "notes": doc.notes,
    }


def list_mappings(client_site=None, doctype=None):
    """List available mappings."""
    filters = {}
    if client_site:
        filters["client_site"] = client_site
    if doctype:
        filters["remote_doctype"] = doctype

    return frappe.get_all(
        "AI Import Mapping",
        filters=filters,
        fields=["name", "mapping_title", "client_site", "remote_doctype", "is_default", "modified"],
        order_by="is_default desc, modified desc",
    )
