"""النشر الجماعي: تطبيق عملية موحّدة على عدة عملاء مع معاينة توافق مسبقة.

القيود المتعمّدة:
- الأنواع المسموحة فقط: Print Format، Custom Field، Settings، Custom HTML Block، Workspace، Item، Customer، Supplier
- كل عميل يُنفَّذ عبر عميل REST مستقل ومقفل على موقعه
- عند فشل عميل: يُسجَّل ويُكمَل الباقي
- كل عملية تُسجَّل في AI Action Log كأي عملية أخرى
"""

import json
import time

import frappe
from frappe.utils import now_datetime

from mubtkir_ai_creator.lib.agent import _dump, log_action
from mubtkir_ai_creator.lib.client import FrappeSiteClient

ALLOWED_TYPES = ("Print Format", "Custom Field", "Settings", "Custom HTML Block", "Workspace", "Item", "Customer", "Supplier")

DENYLIST_TYPES = {
    "User", "AI Client Site", "AI Settings", "AI Task", "AI Action Log",
    "AI Session", "AI Deployment", "AI Deployment Target", "AI Import",
    "AI Import Field Map", "AI Template", "DocType",
}

TYPE_DOCTYPE = {
    "Print Format": "Print Format",
    "Custom Field": "Custom Field",
    "Custom HTML Block": "Custom HTML Block",
    "Workspace": "Workspace",
    "Item": "Item",
    "Customer": "Customer",
    "Supplier": "Supplier",
}

PROMPT_NAMED_TYPES = {"Custom HTML Block", "Workspace"}

FIELD_NAMED_TYPES = {"Item": "item_code", "Customer": "customer_name", "Supplier": "supplier_name"}

# الحقول التي لا تُنسخ أبدًا بين المواقع
# ملاحظة: name يُحذف فقط للأنواع التي لا تحتاجه — انظر _strip_fields()
STRIP_FIELDS_BASE = {
    "owner", "creation", "modified", "modified_by", "idx", "docstatus",
    "doctype", "naming_series", "_user_tags", "_comments", "_assign", "_liked_by",
}


def _strip_fields(deployment_type):
    """تحديد الحقول المحذوفة حسب النوع — الأنواع التي تحتاج name لا نحذفه."""
    needs_name = PROMPT_NAMED_TYPES | {"Print Format"}
    if deployment_type in needs_name:
        return STRIP_FIELDS_BASE  # بدون name
    return STRIP_FIELDS_BASE | {"name"}  # مع name


def _clean_payload(data, deployment_type, skip_none=False):
    """تنظيف بيانات عنصر واحد من الحقول غير المطلوبة."""
    strip = _strip_fields(deployment_type)
    if skip_none:
        return {k: v for k, v in data.items() if k not in strip and v is not None}
    return {k: v for k, v in data.items() if k not in strip}


# ---------------- بناء البيانات ----------------

def build_payloads(dep):
    """استخراج البيانات المراد تطبيقها — يُرجع دائمًا قائمة من العناصر.

    القالب المفرد يُرجع قائمة بعنصر واحد، والقالب الجماعي (batch) يُرجع كل عناصره.
    """
    if dep.deployment_type in DENYLIST_TYPES:
        frappe.throw(f"نوع نشر غير مسموح: {dep.deployment_type}")

    if dep.source_mode == "من قالب":
        return _payloads_from_template(dep)

    if dep.source_mode == "تعريف يدوي":
        return _payloads_from_manual(dep)

    # نسخ من عميل قائم
    return _payloads_from_client(dep)


def _payloads_from_template(dep):
    """استخراج البيانات من قالب — يدعم القوالب المفردة والجماعية."""
    if not dep.source_template:
        frappe.throw("حدد القالب")

    tpl = frappe.get_doc("AI Template", dep.source_template)
    if not tpl.deployable:
        frappe.throw(
            "هذا القالب غير قابل للنشر (Server Script يعمل على سيرفر العميل — للتوثيق والتصدير فقط)"
        )

    raw = json.loads(tpl.payload or "{}")

    # قالب جماعي (capture_batch): قائمة بصيغة [{"source_name": "...", "data": {...}}, ...]
    if isinstance(raw, list):
        items = []
        for entry in raw:
            if isinstance(entry, dict) and "data" in entry:
                items.append(_clean_payload(entry["data"], dep.deployment_type))
            elif isinstance(entry, dict):
                items.append(_clean_payload(entry, dep.deployment_type))
        if not items:
            frappe.throw("بيانات القالب الجماعي فارغة")
        return items

    # قالب مفرد: dict عادي
    if not isinstance(raw, dict) or not raw:
        frappe.throw("بيانات القالب فارغة أو غير صالحة")
    return [_clean_payload(raw, dep.deployment_type)]


def _payloads_from_manual(dep):
    """استخراج البيانات من تعريف يدوي."""
    try:
        raw = json.loads(dep.manual_payload or "{}")
    except ValueError as e:
        frappe.throw(f"التعريف اليدوي ليس JSON صالحًا: {e}")

    if isinstance(raw, list):
        items = []
        for entry in raw:
            if isinstance(entry, dict) and "data" in entry:
                items.append(_clean_payload(entry["data"], dep.deployment_type))
            elif isinstance(entry, dict):
                items.append(_clean_payload(entry, dep.deployment_type))
        if not items:
            frappe.throw("التعريف اليدوي فارغ أو غير صالح")
        return items

    if not isinstance(raw, dict) or not raw:
        frappe.throw("التعريف اليدوي فارغ أو غير صالح")
    return [_clean_payload(raw, dep.deployment_type)]


def _payloads_from_client(dep):
    """استخراج البيانات من عميل مصدر."""
    if not dep.source_client or not dep.source_record:
        frappe.throw("حدد العميل المصدر واسم العنصر")

    src = FrappeSiteClient(dep.source_client)

    if dep.deployment_type == "Settings":
        doc = src.get_doc(dep.source_record, dep.source_record).get("data") or {}
    else:
        doctype = TYPE_DOCTYPE.get(dep.deployment_type, dep.deployment_type)
        doc = src.get_doc(doctype, dep.source_record).get("data") or {}

    if not doc:
        frappe.throw(f"لم يُعثر على «{dep.source_record}» لدى العميل المصدر")

    if isinstance(doc, list):
        doc = doc[0] if doc else {}
    if not isinstance(doc, dict):
        frappe.throw("بيانات العميل المصدر غير صالحة")

    return [_clean_payload(doc, dep.deployment_type, skip_none=True)]


def _identity(dep, payload):
    """تحديد الـ DocType واسم العنصر لدى الهدف."""
    if dep.deployment_type == "Print Format":
        return "Print Format", payload.get("name") or dep.source_record
    if dep.deployment_type == "Custom Field":
        dt = dep.target_doctype or payload.get("dt")
        fieldname = payload.get("fieldname")
        return "Custom Field", f"{dt}-{fieldname}" if dt and fieldname else None
    if dep.deployment_type in PROMPT_NAMED_TYPES:
        return TYPE_DOCTYPE[dep.deployment_type], payload.get("name") or dep.source_record
    if dep.deployment_type in FIELD_NAMED_TYPES:
        field = FIELD_NAMED_TYPES[dep.deployment_type]
        return TYPE_DOCTYPE[dep.deployment_type], payload.get(field) or dep.source_record
    if dep.deployment_type == "Settings":
        return dep.target_doctype, dep.target_doctype
    return TYPE_DOCTYPE.get(dep.deployment_type, dep.deployment_type), dep.source_record


# ---------------- المعاينة ----------------

def preview(name):
    dep = frappe.get_doc("AI Deployment", name)
    payloads = build_payloads(dep)
    dep.db_set("resolved_payload", json.dumps(payloads, ensure_ascii=False, indent=2))

    counts = {"Compatible": 0, "Warning": 0, "Incompatible": 0}

    for row in dep.targets:
        try:
            client = FrappeSiteClient(row.client_site)
            verdict, note = _check_target_multi(dep, payloads, client)
        except Exception as e:
            verdict, note = "Incompatible", f"تعذّر الاتصال: {str(e)[:300]}"

        counts[verdict] = counts.get(verdict, 0) + 1
        row.db_set("compatibility", verdict)
        row.db_set("preview_note", note[:500])
        row.db_set("status", "Pending")
        row.db_set("result", None)

    summary = (
        f"متوافق: {counts.get('Compatible', 0)} | "
        f"تحذير: {counts.get('Warning', 0)} | "
        f"غير متوافق: {counts.get('Incompatible', 0)}"
    )
    dep.db_set("preview_summary", summary)
    dep.db_set("status", "Pending Approval")
    frappe.db.commit()

    return {"summary": summary, "counts": counts, "payload_count": len(payloads)}


def _check_target_multi(dep, payloads, client):
    """فحص توافق موقع واحد مع كل العناصر المراد نشرها."""
    notes = []
    worst = "Compatible"

    for payload in payloads:
        verdict, note = _check_target(dep, payload, client)

        # أسوأ نتيجة تحدد الحكم النهائي
        if verdict == "Incompatible":
            worst = "Incompatible"
        elif verdict == "Warning" and worst != "Incompatible":
            worst = "Warning"

        target_dt, target_name = _identity(dep, payload)
        label = target_name or "?"
        notes.append(f"[{label}] {note}")

    return worst, " | ".join(notes)


def _check_target(dep, payload, client):
    """فحص توافق عنصر واحد مع موقع واحد."""
    target_dt, target_name = _identity(dep, payload)

    if not target_dt or not target_name:
        return "Incompatible", "تعذّر تحديد العنصر المستهدف من البيانات"

    related = None
    if dep.deployment_type == "Print Format":
        related = payload.get("doc_type")
    elif dep.deployment_type == "Custom Field":
        related = dep.target_doctype or payload.get("dt")
    elif dep.deployment_type == "Settings":
        related = dep.target_doctype

    if related:
        try:
            client.get_meta(related)
        except Exception:
            return "Incompatible", f"الـ DocType «{related}» غير موجود لدى هذا العميل"

    exists = False
    try:
        client.get_doc(target_dt, target_name)
        exists = True
    except Exception:
        exists = False

    if dep.deployment_type == "Settings":
        try:
            meta = client.get_meta(dep.target_doctype).get("data", {}) or {}
            known = {f.get("fieldname") for f in meta.get("fields", [])}
            unknown = [k for k in payload.keys() if k not in known]
            if unknown:
                return "Warning", f"حقول غير موجودة وستُتجاهل: {'، '.join(unknown[:10])}"
        except Exception as e:
            return "Incompatible", f"تعذّر قراءة تعريف الإعدادات: {str(e)[:200]}"
        return "Compatible", "سيتم تحديث الإعدادات"

    if exists and not dep.overwrite_existing:
        return "Warning", f"«{target_name}» موجود مسبقًا وسيُتخطّى (فعّل الاستبدال لتجاوز ذلك)"
    if exists and dep.overwrite_existing:
        return "Warning", f"«{target_name}» موجود مسبقًا وسيُستبدل"

    return "Compatible", "سيُنشأ جديدًا"


# ---------------- التنفيذ ----------------

def execute(name):
    dep = frappe.get_doc("AI Deployment", name)
    if dep.status != "Approved":
        frappe.throw("لا يمكن التنفيذ قبل الاعتماد")

    raw = json.loads(dep.resolved_payload or "[]")
    # دعم الصيغة القديمة (dict مفرد) والجديدة (قائمة)
    if isinstance(raw, dict):
        payloads = [raw]
    elif isinstance(raw, list):
        payloads = raw
    else:
        frappe.throw("لا توجد بيانات محسوبة — نفّذ المعاينة أولًا")

    if not payloads:
        frappe.throw("لا توجد بيانات محسوبة — نفّذ المعاينة أولًا")

    dep.db_set("status", "Executing")
    frappe.db.commit()

    success = failed = skipped = 0

    for row in dep.targets:
        start = time.time()
        try:
            client = FrappeSiteClient(row.client_site)
            outcome, note, output = _apply_to_target_multi(dep, payloads, client)
        except Exception as e:
            outcome, note, output = "Failed", str(e)[:500], None
            client = None

        row.db_set("status", outcome)
        row.db_set("result", note[:500])
        row.db_set("executed_on", now_datetime())

        log_action(
            client_site=row.client_site,
            site_url=client.site_url if client else None,
            tool_name=f"deploy_{dep.deployment_type.lower().replace(' ', '_')}",
            risk_level="high",
            tool_input=_dump({"deployment": dep.name, "payload_count": len(payloads)}),
            tool_output=_dump(output),
            is_success=1 if outcome == "Success" else 0,
            duration_ms=int((time.time() - start) * 1000),
            error_message=None if outcome == "Success" else note[:1000],
        )

        if outcome == "Success":
            success += 1
        elif outcome == "Skipped":
            skipped += 1
        else:
            failed += 1

        frappe.db.commit()

    dep.db_set("success_count", success)
    dep.db_set("failed_count", failed)
    dep.db_set("skipped_count", skipped)
    dep.db_set(
        "status",
        "Completed" if failed == 0 else ("Failed" if success == 0 else "Partially Failed"),
    )
    frappe.db.commit()

    return {
        "status": dep.status,
        "success": success,
        "failed": failed,
        "skipped": skipped,
        "targets": [
            {"client": r.client_site, "status": r.status, "result": r.result} for r in dep.targets
        ],
    }


def _apply_to_target_multi(dep, payloads, client):
    """تطبيق كل العناصر على موقع واحد. يُرجع (النتيجة الإجمالية، الملاحظة، مخرجات)."""
    results = []
    all_outputs = []
    any_success = False
    any_fail = False

    for payload in payloads:
        try:
            outcome, note, output = _apply_to_target(dep, payload, client)
        except Exception as e:
            outcome, note, output = "Failed", str(e)[:200], None

        results.append(f"{note}")
        all_outputs.append(output)

        if outcome == "Success":
            any_success = True
        elif outcome == "Failed":
            any_fail = True

    if any_fail and not any_success:
        overall = "Failed"
    elif any_fail and any_success:
        overall = "Success"  # بعضها نجح — نسجّل نجاح مع تفصيل
    elif any_success:
        overall = "Success"
    else:
        overall = "Skipped"

    combined_note = f"[{len(payloads)} items] " + " | ".join(results)
    return overall, combined_note, all_outputs


def _apply_to_target(dep, payload, client):
    """تطبيق عنصر واحد على موقع واحد."""
    target_dt, target_name = _identity(dep, payload)

    if dep.deployment_type == "Settings":
        meta = client.get_meta(dep.target_doctype).get("data", {}) or {}
        known = {f.get("fieldname") for f in meta.get("fields", [])}
        data = {k: v for k, v in payload.items() if k in known}
        if not data:
            return "Skipped", "لا توجد حقول مطابقة لدى هذا العميل", None
        out = client.update_doc(dep.target_doctype, dep.target_doctype, data)
        return "Success", f"تم تحديث {len(data)} حقلًا", out

    exists = True
    try:
        client.get_doc(target_dt, target_name)
    except Exception:
        exists = False

    if exists and not dep.overwrite_existing:
        return "Skipped", f"'{target_name}' exists, overwrite disabled", None

    data = dict(payload)
    if dep.deployment_type == "Custom Field" and dep.target_doctype:
        data["dt"] = dep.target_doctype

    if exists:
        out = client.update_doc(target_dt, target_name, data)
        return "Success", f"Updated '{target_name}'", out

    if dep.deployment_type == "Print Format" or dep.deployment_type in PROMPT_NAMED_TYPES:
        data.setdefault("name", target_name)
    try:
        out = client.create_doc(target_dt, data)
    except Exception as e:
        if "DuplicateEntry" in str(e) and dep.overwrite_existing:
            out = client.update_doc(target_dt, target_name, data)
            return "Success", f"Updated '{target_name}' (fallback)", out
        raise
    created = (out or {}).get("data", {}).get("name")
    return "Success", f"Created '{created or target_name}'", out
