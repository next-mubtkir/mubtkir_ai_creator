"""طبقة الأدوات: كل ما يستطيع النموذج تنفيذه. لا SQL ولا Python حر."""

import json

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
        "default_print_format": data.get("default_print_format"),
        "autoname": data.get("autoname"),
        "is_tree": data.get("is_tree"),
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
    "patch_print_format_html",
    "medium",
    "تعديل جزء محدد فقط من كود Print Format عبر البحث عن نص فريد واستبداله — يحافظ على بقية الكود "
    "كما هو تمامًا دون إعادة إرساله. استخدم هذه الأداة دائمًا للتعديلات الجزئية بدل update_print_format "
    "الذي يستبدل الحقل كاملًا ويخاطر بمحو أجزاء لم يُقصد تغييرها.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "اسم Print Format"},
            "find": {
                "type": "string",
                "description": "نص فريد موجود مرة واحدة بالضبط في الكود الحالي — انسخه حرفيًا من نتيجة get_document لا من الذاكرة",
            },
            "replace": {"type": "string", "description": "النص البديل"},
        },
        "required": ["name", "find", "replace"],
    },
)
def patch_print_format_html(client, name, find, replace):
    doc = client.get_doc("Print Format", name).get("data") or {}
    html = doc.get("html") or ""

    count = html.count(find)
    if count == 0:
        raise ValueError(
            "النص المطلوب البحث عنه غير موجود في الكود الحالي بالضبط. "
            "اقرأ الكود الحالي عبر get_document أولًا وانسخ النص المستهدف بدقة قبل إعادة المحاولة."
        )
    if count > 1:
        raise ValueError(
            f"النص المطلوب البحث عنه يتكرر {count} مرات في الكود — يجب أن يكون فريدًا. "
            "وسّع النص بإضافة سياق أكثر (أسطر قبله أو بعده) حتى يصبح فريدًا."
        )

    new_html = html.replace(find, replace, 1)
    return client.update_doc("Print Format", name, {"html": new_html}).get("data")


@tool(
    "patch_document_field",
    "medium",
    "تعديل جزء محدد فقط من محتوى حقل نصي/كودي في أي مستند (مثل script في Client Script أو Server Script، "
    "أو description، أو أي حقل نصي طويل) عبر بحث واستبدال دقيق — يحافظ على بقية محتوى الحقل وبقية "
    "المستند كما هو تمامًا. الأداة العامة المفضّلة لأي تعديل جزئي على كود أو نص موجود.",
    {
        "type": "object",
        "properties": {
            "doctype": {"type": "string"},
            "name": {"type": "string"},
            "fieldname": {"type": "string", "description": "اسم الحقل النصي المطلوب تعديله، مثل script أو html أو css أو description"},
            "find": {
                "type": "string",
                "description": "نص فريد موجود مرة واحدة بالضبط في محتوى الحقل الحالي — انسخه حرفيًا من get_document لا من الذاكرة",
            },
            "replace": {"type": "string", "description": "النص البديل — أرسل نصًا فارغًا فقط إذا طلب المستخدم صراحةً حذف هذا الجزء"},
        },
        "required": ["doctype", "name", "fieldname", "find", "replace"],
    },
)
def patch_document_field(client, doctype, name, fieldname, find, replace):
    doc = client.get_doc(doctype, name).get("data") or {}
    current = doc.get(fieldname)
    if current is None:
        current = ""
    if not isinstance(current, str):
        raise ValueError(f"الحقل «{fieldname}» ليس نصيًا، لا يمكن تعديله جزئيًا بهذه الأداة")

    count = current.count(find)
    if count == 0:
        raise ValueError(
            f"النص المطلوب البحث عنه غير موجود بالضبط في حقل «{fieldname}» الحالي. "
            "اقرأ المحتوى الحالي عبر get_document أولًا وانسخ النص المستهدف بدقة قبل إعادة المحاولة."
        )
    if count > 1:
        raise ValueError(
            f"النص المطلوب البحث عنه يتكرر {count} مرات في حقل «{fieldname}» — يجب أن يكون فريدًا. "
            "وسّع النص بإضافة سياق أكثر (أسطر قبله أو بعده) حتى يصبح فريدًا."
        )

    new_value = current.replace(find, replace, 1)
    return client.update_doc(doctype, name, {fieldname: new_value}).get("data")


@tool(
    "update_print_format",
    "medium",
    "استبدال كود Print Format بالكامل (HTML/CSS) — استخدمها فقط عند إعادة كتابة التصميم كليًا. "
    "للتعديلات الجزئية استخدم patch_print_format_html بدلًا منها لتفادي محو أجزاء غير مقصودة.",
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

# أنواع تُسمّى يدويًا لدى الموقع (autoname: Prompt) — إسقاط name عنها يجعل
# الموقع الهدف يرفض الإنشاء بخطأ "يرجى تحديد اسم المستند"
_PROMPT_NAMED_DOCTYPES = {"Custom HTML Block", "Workspace"}


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

    if doctype in _PROMPT_NAMED_DOCTYPES and not new_name:
        frappe.throw(f"نوع «{doctype}» يُسمّى يدويًا — مرر new_name لاسم النسخة الجديدة")

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
    "list_client_sites",
    "low",
    "استعراض حسابات العملاء المفعّلة المسجّلة في النظام (اسم السجل الفعلي ورابط الموقع). "
    "استخدمها دائمًا قبل copy_between_clients لإيجاد source_client الصحيح — لأن الاسم الذي يذكره "
    "المستخدم أثناء المحادثة قد يختلف عن اسم السجل الفعلي (name) المطلوب في المعامل، ومحاولة النسخ "
    "باسم غير مطابق تمامًا تفشل بصمت.",
    {
        "type": "object",
        "properties": {
            "search": {"type": "string", "description": "نص للبحث في اسم العميل (اختياري) — اتركه فارغًا لعرض الكل"},
        },
        "required": [],
    },
)
def list_client_sites(client, search=None):
    filters = {"is_active": 1}
    if search:
        filters["client_name"] = ["like", f"%{search}%"]

    return frappe.get_all(
        "AI Client Site",
        filters=filters,
        fields=["name", "client_name", "site_url"],
        order_by="client_name asc",
        limit_page_length=200,
    )


@tool(
    "copy_between_clients",
    "high",
    "نسخ مستند أو تخصيص من حساب عميل إلى حساب عميل مختلف (يتطلب تفعيل السياسة في AI Settings وموافقة صريحة). "
    "لا تستخدمها للتكرار داخل نفس العميل — استخدم duplicate_within_client لذلك. لأنواع التسمية اليدوية "
    "(Custom HTML Block، Workspace) الاسم لدى الهدف يطابق الاسم لدى المصدر حرفيًا؛ إن كان موجودًا مسبقًا "
    "لدى الهدف ستفشل العملية إلا إذا مررت overwrite=true بعد تأكيد صريح من المستخدم على الاستبدال.",
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
            "overwrite": {
                "type": "boolean",
                "default": False,
                "description": "إن كان العنصر بنفس الاسم موجودًا مسبقًا لدى العميل الهدف: true يحدّثه بمحتوى المصدر، false (افتراضي) يوقف العملية بدل الكتابة فوقه بصمت",
            },
        },
        "required": ["source_client", "doctype", "name"],
    },
)
def copy_between_clients(client, source_client, doctype, name, exclude_fields=None, overwrite=False):
    if not frappe.db.get_single_value("AI Settings", "allow_cross_client_copy"):
        frappe.throw("النسخ بين حسابات عملاء مختلفين غير مفعّل في AI Settings")

    source = FrappeSiteClient(source_client)
    doc = source.get_doc(doctype, name).get("data") or {}

    strip = _STRIP_FOR_COPY | set(exclude_fields or [])
    if doctype in _PROMPT_NAMED_DOCTYPES:
        strip = strip - {"name"}  # يلزم تمرير الاسم صراحةً لهذه الأنواع
    payload = {k: v for k, v in doc.items() if k not in strip and v is not None}
    payload["doctype"] = doctype

    if doctype in _PROMPT_NAMED_DOCTYPES:
        target_name = payload.get("name") or name
        exists = False
        try:
            client.get_doc(doctype, target_name)
            exists = True
        except Exception:
            exists = False
        if exists and not overwrite:
            frappe.throw(
                f"يوجد بالفعل «{target_name}» من نوع {doctype} لدى العميل الهدف. أعد الطلب مع overwrite=true "
                f"بعد تأكيد صريح من المستخدم إن كان يريد استبدال المحتوى الحالي هناك."
            )
        if exists and overwrite:
            return {
                "source": {"client": source_client, "doctype": doctype, "name": name},
                "updated": client.update_doc(doctype, target_name, payload).get("data"),
            }

    return {
        "source": {"client": source_client, "doctype": doctype, "name": name},
        "created": client.create_doc(doctype, payload).get("data"),
    }




@tool(
    "capture_as_template",
    "low",
    "التقاط عنصر (تخصيص) من هذا العميل وحفظه كقالب (AI Template) قابل لإعادة الاستخدام أو النشر لاحقًا "
    "على عملاء آخرين — نفس ما يفعله زر «التقاط تخصيص» بشاشة العميل، لكن من داخل المحادثة مباشرة. "
    "الأنواع المدعومة: Custom Field، Property Setter، Print Format، Client Script، Server Script "
    "(توثيق فقط، غير قابل للنشر)، Custom HTML Block، Workspace، Item، Customer، Supplier.",
    {
        "type": "object",
        "properties": {
            "artifact_type": {"type": "string"},
            "name": {"type": "string", "description": "اسم العنصر لدى هذا العميل"},
            "title": {"type": "string", "description": "عنوان اختياري للقالب"},
        },
        "required": ["artifact_type", "name"],
    },
)
def capture_as_template(client, artifact_type, name, title=None):
    from mubtkir_ai_creator.lib.templates import capture

    return capture(client.name, artifact_type, name, title=title)


@tool(
    "create_bulk_deployment",
    "high",
    "إنشاء عملية نشر جماعي (AI Deployment) تنسخ عنصرًا من هذا العميل إلى عدة عملاء آخرين دفعة واحدة، "
    "وتشغيل معاينة التوافق تلقائيًا. **لا تُنفَّذ العملية فعليًا هنا** — تبقى بحالة Pending Approval وتحتاج "
    "اعتمادًا صريحًا من المستخدم عبر سجل AI Deployment نفسه قبل التنفيذ. استخدم list_client_sites أولًا "
    "لتأكيد أسماء سجلات العملاء الهدف قبل تمريرها.",
    {
        "type": "object",
        "properties": {
            "artifact_type": {
                "type": "string",
                "description": "Print Format، Custom Field، Settings، Custom HTML Block، Workspace، Item، Customer، أو Supplier",
            },
            "source_record": {"type": "string", "description": "اسم العنصر لدى هذا العميل (المصدر)"},
            "target_clients": {
                "type": "array",
                "items": {"type": "string"},
                "description": "أسماء سجلات AI Client Site الهدف",
            },
            "target_doctype": {"type": "string", "description": "مطلوب فقط لنوعي Custom Field أو Settings"},
            "title": {"type": "string"},
        },
        "required": ["artifact_type", "source_record", "target_clients"],
    },
)
def create_bulk_deployment(client, artifact_type, source_record, target_clients, target_doctype=None, title=None):
    from mubtkir_ai_creator.lib.deployment import ALLOWED_TYPES
    from mubtkir_ai_creator.lib.deployment import preview as deployment_preview

    if artifact_type not in ALLOWED_TYPES:
        frappe.throw(f"نوع نشر غير مدعوم: {artifact_type}")
    if not target_clients:
        frappe.throw("حدد عميلًا واحدًا على الأقل للنشر عليه")

    dep = frappe.get_doc({
        "doctype": "AI Deployment",
        "title": title or f"{artifact_type}: {source_record}",
        "deployment_type": artifact_type,
        "source_mode": "نسخ من عميل",
        "source_client": client.name,
        "source_record": source_record,
        "target_doctype": target_doctype,
        "targets": [{"client_site": c} for c in target_clients],
    })
    dep.insert(ignore_permissions=True)
    frappe.db.commit()

    result = deployment_preview(dep.name)
    return {
        "deployment": dep.name,
        "summary": result.get("summary"),
        "note": "تم إنشاء عملية النشر وتشغيل معاينة التوافق (Pending Approval). التنفيذ الفعلي يحتاج اعتمادًا صريحًا من سجل AI Deployment.",
    }


@tool(
    "undo_last_action",
    "high",
    "التراجع عن آخر تعديل ناجح على هذا العميل بإرجاع القيم كما كانت قبله (باستخدام value_before المحفوظ "
    "في AI Action Log). يعمل فقط مع تعديلات المحتوى: update_document، update_print_format، "
    "patch_print_format_html، patch_document_field. لا يعمل مع الإنشاء أو الحذف أو الاعتماد/الإلغاء "
    "لأنها تحتاج عكسًا مختلفًا عن استرجاع القيم، وسيرفض التنفيذ برسالة واضحة إن طُلب على أحدها.",
    {
        "type": "object",
        "properties": {
            "action_log": {
                "type": "string",
                "description": "اسم سجل AI Action Log محدد للتراجع عنه (اختياري) — إن تُرك فارغًا يُستخدم آخر تعديل ناجح قابل للتراجع على هذا العميل",
            },
        },
        "required": [],
    },
)
def undo_last_action(client, action_log=None):
    undoable = {"update_document", "update_print_format", "patch_print_format_html", "patch_document_field"}

    if action_log:
        log = frappe.get_doc("AI Action Log", action_log)
        if log.client_site != client.name:
            frappe.throw("سجل الإجراء هذا لا يخص هذا العميل")
    else:
        rows = frappe.get_all(
            "AI Action Log",
            filters={
                "client_site": client.name,
                "tool_name": ["in", list(undoable)],
                "is_success": 1,
                "value_before": ["is", "set"],
            },
            fields=["name"],
            order_by="timestamp desc",
            limit_page_length=1,
        )
        if not rows:
            frappe.throw("لا يوجد إجراء قابل للتراجع مسجّل لهذا العميل")
        log = frappe.get_doc("AI Action Log", rows[0].name)

    if log.tool_name not in undoable:
        frappe.throw(f"لا يمكن التراجع عن «{log.tool_name}» تلقائيًا — يحتاج تدخلًا يدويًا")
    if not log.value_before:
        frappe.throw("لا توجد قيمة سابقة محفوظة لهذا الإجراء")

    args = json.loads(log.tool_input or "{}")
    before = json.loads(log.value_before)
    dt = args.get("doctype") or "Print Format"
    nm = args.get("name")
    if not nm:
        frappe.throw("تعذّر تحديد اسم المستند من سجل الإجراء")

    strip = {"name", "owner", "creation", "modified", "modified_by", "doctype", "docstatus", "idx"}
    restore = {k: v for k, v in before.items() if k not in strip}
    out = client.update_doc(dt, nm, restore)
    return {"restored": {"doctype": dt, "name": nm}, "from_action_log": log.name, "result": out.get("data")}


@tool(
    "search_past_tasks",
    "low",
    "البحث في المهام (AI Task) السابقة لهذا العميل بوصف نصي تقريبي — يسمح للمستخدم يرجع لمهمة قديمة "
    "بذكرها بالوصف بدل البحث اليدوي، مثل «المهمة اللي عدّلت فيها ضريبة القيمة المضافة الأسبوع اللي فات».",
    {
        "type": "object",
        "properties": {
            "search": {"type": "string", "description": "كلمات من نص الطلب أو الخطة للبحث عنها"},
            "limit": {"type": "integer", "default": 10},
        },
        "required": ["search"],
    },
)
def search_past_tasks(client, search, limit=10):
    return frappe.get_all(
        "AI Task",
        filters={
            "client_site": client.name,
            "request_text": ["like", f"%{search}%"],
        },
        fields=["name", "request_text", "status", "creation"],
        order_by="creation desc",
        limit_page_length=min(limit, 20),
    )


@tool(
    "search_templates",
    "low",
    "بحث نصي كامل في القوالب المحفوظة (AI Template) — يبحث بعنوان القالب وأيضًا داخل محتواه (JSON) وملاحظاته، "
    "مو بالعنوان فقط. استخدمها للعثور على قالب لنقله لعميل آخر لو المستخدم وصفه بدل ذكر اسمه بالضبط.",
    {
        "type": "object",
        "properties": {
            "search": {"type": "string", "description": "كلمات للبحث عنها بالعنوان أو المحتوى أو الملاحظات"},
            "limit": {"type": "integer", "default": 10},
        },
        "required": ["search"],
    },
)
def search_templates(client, search, limit=10):
    from mubtkir_ai_creator.lib.templates import search_templates as _search

    return _search(search, limit=limit)


# ---------------- أدوات Workspace ----------------

@tool(
    "list_workspaces",
    "low",
    "استعراض كل Workspaces المتاحة لدى العميل",
    {"type": "object", "properties": {}, "required": []},
)
def _list_workspaces(client):
    from mubtkir_ai_creator.lib.workspace_tools import list_workspaces
    return list_workspaces(client)


@tool(
    "get_workspace_content",
    "low",
    "قراءة محتوى Workspace بالكامل: الاختصارات والروابط والبلوكات المخصصة",
    {"type": "object", "properties": {"workspace_name": {"type": "string"}}, "required": ["workspace_name"]},
)
def _get_workspace_content(client, workspace_name):
    from mubtkir_ai_creator.lib.workspace_tools import get_workspace_content
    return get_workspace_content(client, workspace_name)


@tool(
    "add_workspace_shortcut",
    "medium",
    "إضافة اختصار جديد إلى Workspace لدى العميل",
    {
        "type": "object",
        "properties": {
            "workspace_name": {"type": "string"},
            "label": {"type": "string"},
            "link_to": {"type": "string", "description": "اسم DocType أو Page"},
            "link_type": {"type": "string", "default": "DocType"},
            "doc_view": {"type": "string", "default": "List"},
            "color": {"type": "string", "default": "Blue"},
        },
        "required": ["workspace_name", "label", "link_to"],
    },
)
def _add_workspace_shortcut(client, workspace_name, label, link_to, link_type="DocType", doc_view="List", color="Blue"):
    from mubtkir_ai_creator.lib.workspace_tools import add_shortcut
    return add_shortcut(client, workspace_name, label, link_to, link_type, doc_view, color)


@tool(
    "add_workspace_link",
    "medium",
    "إضافة رابط داخل بطاقة في Workspace لدى العميل — ينشئ البطاقة تلقائيًا إن لم تكن موجودة",
    {
        "type": "object",
        "properties": {
            "workspace_name": {"type": "string"},
            "card_name": {"type": "string", "description": "اسم البطاقة"},
            "label": {"type": "string"},
            "link_to": {"type": "string"},
            "link_type": {"type": "string", "default": "DocType"},
            "description": {"type": "string", "default": ""},
        },
        "required": ["workspace_name", "card_name", "label", "link_to"],
    },
)
def _add_workspace_link(client, workspace_name, card_name, label, link_to, link_type="DocType", description=""):
    from mubtkir_ai_creator.lib.workspace_tools import add_link
    return add_link(client, workspace_name, card_name, label, link_to, link_type, description)


@tool(
    "add_workspace_block",
    "medium",
    "إضافة Custom Block (HTML Block) إلى Workspace لدى العميل — يجب أن يكون البلوك موجودًا مسبقًا كمستند Custom HTML Block",
    {
        "type": "object",
        "properties": {
            "workspace_name": {"type": "string"},
            "block_name": {"type": "string", "description": "اسم Custom HTML Block الموجود لدى العميل"},
        },
        "required": ["workspace_name", "block_name"],
    },
)
def _add_workspace_block(client, workspace_name, block_name):
    from mubtkir_ai_creator.lib.workspace_tools import add_custom_block
    return add_custom_block(client, workspace_name, block_name)


@tool(
    "list_custom_blocks",
    "low",
    "استعراض Custom HTML Blocks المتاحة لدى العميل",
    {"type": "object", "properties": {}, "required": []},
)
def _list_custom_blocks(client):
    from mubtkir_ai_creator.lib.workspace_tools import list_custom_blocks
    return list_custom_blocks(client)


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
