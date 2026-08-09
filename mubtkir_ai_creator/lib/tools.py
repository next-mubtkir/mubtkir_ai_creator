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


@tool(
    "copy_between_clients",
    "high",
    "نسخ مستند أو تخصيص من حساب عميل إلى حساب عميل آخر (يتطلب تفعيل السياسة وموافقة صريحة)",
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
        frappe.throw("النسخ بين حسابات العملاء غير مفعّل في AI Settings")

    source = FrappeSiteClient(source_client)
    doc = source.get_doc(doctype, name).get("data") or {}

    strip = set(
        (exclude_fields or [])
        + [
            "name", "owner", "creation", "modified", "modified_by", "idx",
            "docstatus", "doctype", "naming_series",
        ]
    )
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
