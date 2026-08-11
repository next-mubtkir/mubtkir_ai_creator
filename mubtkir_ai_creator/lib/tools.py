"""طبقة الأدوات: كل ما يستطيع النموذج تنفيذه. لا SQL ولا Python حر."""

import frappe

from mubtkir_ai_creator.lib.client import FrappeSiteClient

# مستويات الخطورة: low = تنفيذ مباشر، medium/high = تحتاج موافقة
TOOLS = {}


def tool(name, risk, description, schema):
    def wrapper(fn):
        TOOLS[name] = {
            "name": name,
            "risk": risk,
            "description": description,
            "schema": schema,
            "fn": fn,
        }
        return fn

    return wrapper


# ---------------- أدوات القراءة (Low) ----------------

@tool(
    "inspect_doctype",
    "low",
    "قراءة تعريف DocType لدى العميل: الحقول وخصائصها والصلاحيات",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string", "description": "اسم الـ DocType"}},
        "required": ["doctype"],
    },
)
def inspect_doctype(client, doctype):
    data = client.get_meta(doctype).get("data", {})
    return {
        "name": data.get("name"),
        "module": data.get("module"),
        "is_submittable": data.get("is_submittable"),
        "fields": [
            {
                "fieldname": f.get("fieldname"),
                "label": f.get("label"),
                "fieldtype": f.get("fieldtype"),
                "options": f.get("options"),
                "reqd": f.get("reqd"),
            }
            for f in data.get("fields", [])
        ],
    }


@tool(
    "get_document",
    "low",
    "قراءة مستند واحد بالكامل من حساب العميل",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "name": {"type": "string"},
        },
        "required": ["doctype", "name"],
    },
)
def get_document(client, doctype, name):
    return client.get_doc(doctype, name).get("data")


@tool(
    "list_documents",
    "low",
    "قراءة قائمة مستندات مع فلاتر وحقول محددة",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "fields": {"type": "array", "items": {"type": "string"}},
            "filters": {"type": "object", "description": "فلاتر بصيغة {\"field\": \"value\"}"},
            "limit": {"type": "integer", "default": 20},
        },
        "required": ["doctype"],
    },
)
def list_documents(client, doctype, fields=None, filters=None, limit=20):
    return client.get_list(
        doctype, fields=fields or ["name"], filters=filters, limit=min(limit or 20, 100)
    ).get("data")


@tool(
    "inspect_customizations",
    "low",
    "قراءة التخصيصات لدى العميل: Custom Fields و Property Setters",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string", "description": "اختياري: حصر النتيجة بـ DocType معيّن"}},
    },
)
def inspect_customizations(client, doctype=None):
    filters = {"dt": doctype} if doctype else None
    cf = client.get_list(
        "Custom Field",
        fields=["name", "dt", "fieldname", "label", "fieldtype", "options", "insert_after"],
        filters=filters,
        limit=100,
    ).get("data")
    ps_filters = {"doc_type": doctype} if doctype else None
    ps = client.get_list(
        "Property Setter",
        fields=["name", "doc_type", "field_name", "property", "value"],
        filters=ps_filters,
        limit=100,
    ).get("data")
    return {"custom_fields": cf, "property_setters": ps}


@tool(
    "diagnose_permissions",
    "low",
    "تشخيص صلاحيات مستخدم: أدواره وصلاحيات DocType معيّن",
    {
        "type": "object",
        "properties": {
            "user": {"type": "string"},
            "doctype": {"type": "string"},
        },
        "required": ["user", "doctype"],
    },
)
def diagnose_permissions(client, user, doctype):
    roles = client.get_list(
        "Has Role", fields=["role"], filters={"parent": user}, limit=100
    ).get("data")
    perms = client.get_list(
        "Custom DocPerm",
        fields=["role", "read", "write", "create", "submit", "cancel", "amend", "permlevel"],
        filters={"parent": doctype},
        limit=100,
    ).get("data")
    return {"user": user, "roles": roles, "doctype": doctype, "permissions": perms}


@tool(
    "list_link_options",
    "low",
    "عرض القيم المتاحة فعليًا لحقل ربط (Link) لدى العميل. استخدمها إلزاميًا قبل أي إنشاء أو تعديل يحتوي حقل ربط",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string", "description": "الـ DocType المرتبط، مثل Item Group أو UOM أو Warehouse"},
            "search": {"type": "string", "description": "نص بحث اختياري"},
            "limit": {"type": "integer", "default": 20},
        },
        "required": ["doctype"],
    },
)
def list_link_options(client, doctype, search=None, limit=20):
    filters = {"name": ["like", f"%{search}%"]} if search else None
    rows = client.get_list(
        doctype, fields=["name"], filters=filters, limit=min(limit or 20, 50)
    ).get("data") or []
    return {"doctype": doctype, "count": len(rows), "options": [r.get("name") for r in rows]}


@tool(
    "validate_links",
    "low",
    "التحقق من أن كل قيم حقول الربط في بيانات مقترحة موجودة فعلًا لدى العميل قبل الكتابة",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string", "description": "الـ DocType المستهدف"},
            "data": {"type": "object", "description": "البيانات المقترحة كما ستُرسل"},
        },
        "required": ["doctype", "data"],
    },
)
def validate_links(client, doctype, data):
    return check_links(client, doctype, data)


def check_links(client, doctype, data):
    """الفحص الفعلي لحقول الربط — يُستدعى كأداة ومن طبقة التنفيذ الإلزامية معًا."""
    meta = client.get_meta(doctype).get("data", {}) or {}
    link_fields = {
        f.get("fieldname"): f.get("options")
        for f in meta.get("fields", [])
        if f.get("fieldtype") == "Link" and f.get("options")
    }

    valid, invalid = {}, {}
    for fieldname, value in (data or {}).items():
        target = link_fields.get(fieldname)
        if not target or not value or not isinstance(value, str):
            continue
        try:
            rows = client.get_list(
                target, fields=["name"], filters={"name": value}, limit=1
            ).get("data") or []
        except Exception as e:
            invalid[fieldname] = {"value": value, "doctype": target, "error": str(e)[:200]}
            continue

        if rows:
            valid[fieldname] = value
        else:
            try:
                available = client.get_list(target, fields=["name"], limit=15).get("data") or []
            except Exception:
                available = []
            invalid[fieldname] = {
                "value": value,
                "doctype": target,
                "available_options": [r.get("name") for r in available],
            }

    return {
        "doctype": doctype,
        "all_valid": not invalid,
        "valid_fields": valid,
        "invalid_fields": invalid,
    }


@tool(
    "get_required_fields",
    "low",
    "معرفة الحقول الإجبارية لـ DocType لدى العميل قبل الإنشاء، مع القيم المتاحة لحقول الربط الإجبارية",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string"}},
        "required": ["doctype"],
    },
)
def get_required_fields(client, doctype):
    return describe_required(client, doctype)


def describe_required(client, doctype, with_options=True):
    """استخراج الحقول الإجبارية مع نوعها وقيمها المتاحة — يُستخدم كأداة ومن بوابة التنفيذ."""
    meta = client.get_meta(doctype).get("data", {}) or {}

    required, conditional = [], []
    for f in meta.get("fields", []):
        if f.get("fieldtype") in ("Section Break", "Column Break", "Tab Break", "HTML"):
            continue

        info = {
            "fieldname": f.get("fieldname"),
            "label": f.get("label"),
            "fieldtype": f.get("fieldtype"),
            "link_to": f.get("options") if f.get("fieldtype") == "Link" else None,
            "select_options": (f.get("options") or "").split("\n") if f.get("fieldtype") == "Select" else None,
            "default": f.get("default"),
        }

        if f.get("reqd"):
            if with_options and info["link_to"]:
                try:
                    rows = client.get_list(info["link_to"], fields=["name"], limit=15).get("data") or []
                    info["available_options"] = [r.get("name") for r in rows]
                except Exception:
                    info["available_options"] = []
            required.append(info)
        elif f.get("mandatory_depends_on"):
            info["mandatory_depends_on"] = f.get("mandatory_depends_on")
            conditional.append(info)

    return {
        "doctype": doctype,
        "required_fields": required,
        "conditionally_required_fields": conditional,
        "note": "الحقول التي لها default قد تُملأ تلقائيًا، لكن يُفضّل تأكيدها مع المستخدم",
    }


def find_missing_required(client, doctype, data):
    """إرجاع الحقول الإجبارية الناقصة في بيانات مقترحة (تتجاهل ما له قيمة افتراضية)."""
    spec = describe_required(client, doctype, with_options=True)
    data = data or {}

    missing = []
    for f in spec["required_fields"]:
        fieldname = f["fieldname"]
        value = data.get(fieldname)
        if value not in (None, "", []):
            continue
        if f.get("default"):
            continue  # سيُملأ تلقائيًا من القيمة الافتراضية
        missing.append(f)

    return {"doctype": doctype, "missing_required": missing, "is_complete": not missing}


@tool(
    "find_document_name",
    "low",
    "إيجاد الاسم الحقيقي (docname) لمستند حسب حقول تحدده، إلزامي قبل تعديل أو حذف مستندات ذات أسماء مولَّدة تلقائيًا مثل Custom Field وProperty Setter (اسمها ليس نفس ما كتبه المستخدم)",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "filters": {"type": "object", "description": "مثال لـ Custom Field: {\"dt\": \"Sales Invoice\", \"fieldname\": \"warranty_work\"}"},
        },
        "required": ["doctype", "filters"],
    },
)
def find_document_name(client, doctype, filters):
    rows = client.get_list(doctype, fields=["name"], filters=filters, limit=5).get("data") or []
    return {"doctype": doctype, "filters": filters, "matches": [r.get("name") for r in rows]}


@tool(
    "set_field_translation",
    "medium",
    "إضافة أو تحديث ترجمة نص (مثل تسمية حقل) بحيث تظهر بلغة مختلفة تلقائيًا حسب لغة واجهة كل مستخدم",
    {
        "type": "object",
        "properties": {
            "source_text": {"type": "string", "description": "النص كما هو مكتوب حاليًا (لغة النظام الافتراضية)"},
            "language": {"type": "string", "description": "رمز اللغة الهدف، مثل en أو ar"},
            "translated_text": {"type": "string", "description": "النص المترجَم لهذه اللغة"},
        },
        "required": ["source_text", "language", "translated_text"],
    },
)
def set_field_translation(client, source_text, language, translated_text):
    existing = client.get_list(
        "Translation", fields=["name"],
        filters={"source_text": source_text, "language": language}, limit=1,
    ).get("data") or []

    if existing:
        return client.update_doc("Translation", existing[0]["name"], {"translated_text": translated_text}).get("data")
    return client.create_doc(
        "Translation",
        {"source_text": source_text, "language": language, "translated_text": translated_text},
    ).get("data")


# ---------------- أدوات الكتابة (Medium) ----------------

@tool(
    "create_document",
    "medium",
    "إنشاء مستند جديد في حساب العميل",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "data": {"type": "object", "description": "حقول المستند"},
        },
        "required": ["doctype", "data"],
    },
)
def create_document(client, doctype, data):
    return client.create_doc(doctype, data).get("data")


@tool(
    "update_document",
    "medium",
    "تعديل مستند قائم في حساب العميل",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "name": {"type": "string"},
            "data": {"type": "object", "description": "الحقول المطلوب تعديلها فقط"},
        },
        "required": ["doctype", "name", "data"],
    },
)
def update_document(client, doctype, name, data):
    return client.update_doc(doctype, name, data).get("data")


@tool(
    "add_custom_field",
    "medium",
    "إضافة Custom Field إلى DocType لدى العميل",
    {
        "type": "object",
        "properties": {
            "dt": {"type": "string", "description": "الـ DocType المستهدف"},
            "fieldname": {"type": "string"},
            "label": {"type": "string"},
            "fieldtype": {"type": "string"},
            "options": {"type": "string"},
            "insert_after": {"type": "string"},
            "reqd": {"type": "integer", "default": 0},
        },
        "required": ["dt", "fieldname", "label", "fieldtype"],
    },
)
def add_custom_field(client, dt, fieldname, label, fieldtype, options=None, insert_after=None, reqd=0):
    payload = {
        "dt": dt,
        "fieldname": fieldname,
        "label": label,
        "fieldtype": fieldtype,
        "reqd": reqd,
    }
    if options:
        payload["options"] = options
    if insert_after:
        payload["insert_after"] = insert_after
    return client.create_doc("Custom Field", payload).get("data")


@tool(
    "update_print_format",
    "medium",
    "تعديل Print Format لدى العميل (HTML/CSS)",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "html": {"type": "string"},
            "css": {"type": "string"},
        },
        "required": ["name"],
    },
)
def update_print_format(client, name, html=None, css=None):
    data = {}
    if html is not None:
        data["html"] = html
    if css is not None:
        data["css"] = css
    return client.update_doc("Print Format", name, data).get("data")


# ---------------- أدوات عالية الخطورة (High) ----------------

@tool(
    "submit_document",
    "high",
    "اعتماد (Submit) مستند لدى العميل",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string"}, "name": {"type": "string"}},
        "required": ["doctype", "name"],
    },
)
def submit_document(client, doctype, name):
    return client.update_doc(doctype, name, {"docstatus": 1}).get("data")


@tool(
    "cancel_document",
    "high",
    "إلغاء (Cancel) مستند معتمد لدى العميل",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string"}, "name": {"type": "string"}},
        "required": ["doctype", "name"],
    },
)
def cancel_document(client, doctype, name):
    return client.call_method(
        "frappe.client.cancel", {"doctype": doctype, "name": name}
    ).get("message")


@tool(
    "delete_document",
    "high",
    "حذف مستند من حساب العميل",
    {
        "type": "object",
        "properties": {"doctype": {"type": "string"}, "name": {"type": "string"}},
        "required": ["doctype", "name"],
    },
)
def delete_document(client, doctype, name):
    return client.delete_doc(doctype, name)


_STRIP_FOR_COPY = {
    "name", "owner", "creation", "modified", "modified_by", "idx",
    "docstatus", "doctype", "naming_series",
}


@tool(
    "duplicate_within_client",
    "medium",
    "تكرار مستند أو تخصيص (مثل Print Format) داخل حساب نفس العميل — نسخة جديدة بنفس البيانات",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "name": {"type": "string", "description": "اسم المستند المراد تكراره"},
            "new_name": {"type": "string", "description": "اسم/عنوان النسخة الجديدة إن لزم (مثل حقل name لـ Print Format)"},
            "overrides": {"type": "object", "description": "حقول تُستبدل قيمتها في النسخة الجديدة"},
        },
        "required": ["doctype", "name"],
    },
)
def duplicate_within_client(client, doctype, name, new_name=None, overrides=None):
    doc = client.get_doc(doctype, name).get("data") or {}
    if not doc:
        frappe.throw(f"لم يُعثر على «{name}» من نوع {doctype} لدى هذا العميل")

    payload = {k: v for k, v in doc.items() if k not in _STRIP_FOR_COPY and v is not None}
    payload["doctype"] = doctype
    if new_name:
        payload["name"] = new_name
    if overrides:
        payload.update(overrides)

    return {
        "source": {"doctype": doctype, "name": name},
        "created": client.create_doc(doctype, payload).get("data"),
    }


@tool(
    "copy_between_clients",
    "high",
    "نسخ مستند أو تخصيص من حساب عميل إلى حساب عميل مختلف (يتطلب تفعيل السياسة في AI Settings وموافقة صريحة). "
    "لا تستخدمها للتكرار داخل نفس العميل — استخدم duplicate_within_client لذلك",
    {
        "type": "object",
        "properties": {
            "source_client": {"type": "string", "description": "اسم سجل AI Client Site المصدر"},
            "doctype": {"type": "string"},
            "name": {"type": "string"},
            "exclude_fields": {
                "type": "array",
                "items": {"type": "string"},
                "description": "حقول تُستبعد من النسخ (مثل الأسعار أو الحسابات المحاسبية)",
            },
        },
        "required": ["source_client", "doctype", "name"],
    },
)
def copy_between_clients(client, source_client, doctype, name, exclude_fields=None):
    if not frappe.db.get_single_value("AI Settings", "allow_cross_client_copy"):
        frappe.throw("النسخ بين حسابات عملاء مختلفين غير مفعّل في AI Settings")

    source = FrappeSiteClient(source_client)
    doc = source.get_doc(doctype, name).get("data") or {}

    strip = _STRIP_FOR_COPY | set(exclude_fields or [])
    payload = {k: v for k, v in doc.items() if k not in strip and v is not None}
    payload["doctype"] = doctype

    return {
        "source": {"client": source_client, "doctype": doctype, "name": name},
        "created": client.create_doc(doctype, payload).get("data"),
    }


# ---------------- مساعدات ----------------

def get_tool_definitions():
    """إرجاع تعريفات الأدوات بصيغة Tool Calling."""
    return [
        {
            "name": t["name"],
            "description": f"[خطورة: {t['risk']}] {t['description']}",
            "input_schema": t["schema"],
        }
        for t in TOOLS.values()
    ]


def get_risk(tool_name):
    t = TOOLS.get(tool_name)
    if not t:
        frappe.throw(f"أداة غير معروفة: {tool_name}")
    return t["risk"]


def run_tool(client, tool_name, arguments):
    t = TOOLS.get(tool_name)
    if not t:
        frappe.throw(f"أداة غير معروفة: {tool_name}")
    return t["fn"](client, **(arguments or {}))


def validate_call(tool_name, arguments):
    """التحقق من معاملات استدعاء أداة قبل تنفيذه أو طلب الموافقة عليه.

    يمنع أخطاء مثل TypeError الناتجة عن معامل اخترعه النموذج ولا وجود له
    في تعريف الأداة (مثل doc_type_target بدل doctype)، ويعيد رسالة عربية
    واضحة تسمح للنموذج بتصحيح الاستدعاء تلقائيًا بدل فشل التنفيذ لاحقًا.
    """
    t = TOOLS.get(tool_name)
    if not t:
        return f"أداة غير معروفة: {tool_name}"

    props = (t["schema"] or {}).get("properties", {}) or {}
    required = (t["schema"] or {}).get("required", []) or []
    arguments = arguments or {}

    unknown = [k for k in arguments if k not in props]
    missing = [k for k in required if k not in arguments]

    if not unknown and not missing:
        return None

    lines = [f"استدعاء غير صالح للأداة «{tool_name}» — لم يُنفَّذ."]
    if unknown:
        lines.append(f"معاملات غير معروفة: {'، '.join(unknown)}")
    if missing:
        lines.append(f"معاملات إجبارية ناقصة: {'، '.join(missing)}")
    lines.append(f"المعاملات الصحيحة لهذه الأداة: {'، '.join(props.keys()) or 'بلا معاملات'}")
    return "\n".join(lines)
