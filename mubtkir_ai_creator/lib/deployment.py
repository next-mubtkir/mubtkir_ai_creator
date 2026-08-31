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

# أنواع مرفوضة صراحةً حتى لو اختيرت من قائمة "كل DocTypes" — تحتوي بيانات اعتماد
# أو هي جزء داخلي من هذا التطبيق نفسه، ونشرها بين عملاء خطأ شائع خطير
DENYLIST_TYPES = {
    "User", "AI Client Site", "AI Settings", "AI Task", "AI Action Log",
    "AI Session", "AI Deployment", "AI Deployment Target", "AI Import",
    "AI Import Field Map", "AI Template", "DocType",
}

# اسم الـ DocType الفعلي لدى الموقع، لكل نوع نشر يُقرأ منه/يُكتب إليه مباشرة
# (Settings حالة خاصة: الاسم = اسم الـ DocType نفسه لأنه Single)
TYPE_DOCTYPE = {
    "Print Format": "Print Format",
    "Custom Field": "Custom Field",
    "Custom HTML Block": "Custom HTML Block",
    "Workspace": "Workspace",
    "Item": "Item",
    "Customer": "Customer",
    "Supplier": "Supplier",
}

# أنواع تُسمّى يدويًا لدى الموقع (autoname: Prompt) — لازم نمرر name صراحةً
# عند الإنشاء، وإلا يرفض الموقع الهدف الطلب بخطأ "يرجى تحديد اسم المستند"
PROMPT_NAMED_TYPES = {"Custom HTML Block", "Workspace"}

# أنواع تُسمّى تلقائيًا من قيمة حقل معيّن لديها (field-based autoname) —
# نحدد اسم العنصر لدى الهدف من نفس الحقل بدل الاعتماد على target_doctype
FIELD_NAMED_TYPES = {"Item": "item_code", "Customer": "customer_name", "Supplier": "supplier_name"}

# الحقول التي لا تُنسخ أبدًا بين المواقع
STRIP_FIELDS = {
    "name", "owner", "creation", "modified", "modified_by", "idx", "docstatus",
    "doctype", "naming_series", "_user_tags", "_comments", "_assign", "_liked_by",
}


# ---------------- بناء البيانات ----------------

def _ensure_dict(payload, label="البيانات"):
    """تحويل list إلى dict (أخذ العنصر الأول) مع التحقق من الصلاحية."""
    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    if not isinstance(payload, dict):
        frappe.throw(f"{label} ليست كائن JSON صالحًا (dict)")
    return payload


def build_payload(dep):
    """استخراج البيانات المراد تطبيقها، من عميل مصدر أو من تعريف يدوي."""
    if dep.deployment_type in DENYLIST_TYPES:
        frappe.throw(f"نوع نشر غير مسموح: {dep.deployment_type}")

    if dep.source_mode == "من قالب":
        if not dep.source_template:
            frappe.throw("حدد القالب")
        tpl = frappe.get_doc("AI Template", dep.source_template)
        if not tpl.deployable:
            frappe.throw(
                "هذا القالب غير قابل للنشر (Server Script يعمل على سيرفر العميل — للتوثيق والتصدير فقط)"
            )
        payload = json.loads(tpl.payload or "{}")
        payload = _ensure_dict(payload, "بيانات القالب")
        return {k: v for k, v in payload.items() if k not in STRIP_FIELDS}

    if dep.source_mode == "تعريف يدوي":
        try:
            payload = json.loads(dep.manual_payload or "{}")
        except ValueError as e:
            frappe.throw(f"التعريف اليدوي ليس JSON صالحًا: {e}")
        payload = _ensure_dict(payload, "التعريف اليدوي")
        if not payload:
            frappe.throw("التعريف اليدوي فارغ أو غير صالح")
        return {k: v for k, v in payload.items() if k not in STRIP_FIELDS}

    # نسخ من عميل قائم
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

    doc = _ensure_dict(doc, "بيانات العميل المصدر")
    return {k: v for k, v in doc.items() if k not in STRIP_FIELDS and v is not None}


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
        return dep.target_doctype, dep.target_doctype  # Single doctype
    # أي نوع آخر غير مصنّف صراحة أعلاه: افتراض أن الاسم لدى الهدف يطابق اسمه لدى المصدر
    return TYPE_DOCTYPE.get(dep.deployment_type, dep.deployment_type), dep.source_record


# ---------------- المعاينة ----------------

def preview(name):
    dep = frappe.get_doc("AI Deployment", name)
    payload = build_payload(dep)
    dep.db_set("resolved_payload", json.dumps(payload, ensure_ascii=False, indent=2))

    counts = {"Compatible": 0, "Warning": 0, "Incompatible": 0}

    for row in dep.targets:
        try:
            client = FrappeSiteClient(row.client_site)
            verdict, note = _check_target(dep, payload, client)
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

    return {"summary": summary, "counts": counts, "payload": payload}


def _check_target(dep, payload, client):
    """فحص توافق موقع واحد قبل التنفيذ."""
    target_dt, target_name = _identity(dep, payload)

    if not target_dt or not target_name:
        return "Incompatible", "تعذّر تحديد العنصر المستهدف من البيانات"

    # 1) هل الـ DocType المرتبط موجود لدى الهدف؟
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

    # 2) هل العنصر موجود مسبقًا؟
    exists = False
    try:
        client.get_doc(target_dt, target_name)
        exists = True
    except Exception:
        exists = False

    if dep.deployment_type == "Settings":
        # التحقق من أن كل حقل في البيانات موجود في تعريف الإعدادات لدى الهدف
        try:
            meta = client.get_meta(dep.target_doctype).get("data", {}) or {}
            known = {f.get("fieldname") for f in meta.get("fields", [])}
            unknown = [k for k in payload.keys() if k not in known]
            if unknown:
                return "Warning", f"حقول غير موجودة لدى هذا العميل وستُتجاهل: {'، '.join(unknown[:10])}"
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

    payload = json.loads(dep.resolved_payload or "{}")
    if not payload:
        frappe.throw("لا توجد بيانات محسوبة — نفّذ المعاينة أولًا")

    dep.db_set("status", "Executing")
    frappe.db.commit()

    success = failed = skipped = 0

    for row in dep.targets:
        start = time.time()
        try:
            client = FrappeSiteClient(row.client_site)
            outcome, note, output = _apply_to_target(dep, payload, client)
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
            tool_input=_dump({"deployment": dep.name, "payload": payload}),
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

        frappe.db.commit()  # لا نفقد نتائج من نجح إن انقطع التنفيذ لاحقًا

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


def _apply_to_target(dep, payload, client):
    """تطبيق العملية على موقع واحد. يُرجع (النتيجة، الملاحظة، مخرجات API)."""
    target_dt, target_name = _identity(dep, payload)

    if dep.deployment_type == "Settings":
        meta = client.get_meta(dep.target_doctype).get("data", {}) or {}
        known = {f.get("fieldname") for f in meta.get("fields", [])}
        data = {k: v for k, v in payload.items() if k in known}
        if not data:
            return "Skipped", "لا توجد حقول مطابقة لدى هذا العميل", None
        out = client.update_doc(dep.target_doctype, dep.target_doctype, data)
        return "Success", f"تم تحديث {len(data)} حقلًا", out

    # Print Format / Custom Field
    exists = True
    try:
        client.get_doc(target_dt, target_name)
    except Exception:
        exists = False

    if exists and not dep.overwrite_existing:
        return "Skipped", f"'{target_name}' already exists and overwrite is disabled", None

    data = dict(payload)
    if dep.deployment_type == "Custom Field" and dep.target_doctype:
        data["dt"] = dep.target_doctype

    if exists:
        out = client.update_doc(target_dt, target_name, data)
        return "Success", f"Updated '{target_name}'", out

    data.setdefault("name", target_name) if dep.deployment_type == "Print Format" or dep.deployment_type in PROMPT_NAMED_TYPES else None
    try:
        out = client.create_doc(target_dt, data)
    except Exception as e:
        # Fallback: if DuplicateEntry and overwrite is enabled, try update instead
        if "DuplicateEntry" in str(e) and dep.overwrite_existing:
            out = client.update_doc(target_dt, target_name, data)
            return "Success", f"Updated '{target_name}' (was not detected initially)", out
        raise
    created = (out or {}).get("data", {}).get("name")
    return "Success", f"Created '{created or target_name}'", out
