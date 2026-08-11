"""إعداد ما بعد التثبيت: إنشاء الأدوار."""

import frappe

ROLES = [
    ("AI Creator User", "موظف يشغّل الوكيل على حسابات العملاء"),
    ("AI Creator Supervisor", "مشرف يعتمد العمليات متوسطة وعالية الخطورة"),
]


def after_install():
    for name, desc in ROLES:
        if not frappe.db.exists("Role", name):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": name,
                "desk_access": 1,
            }).insert(ignore_permissions=True)
    frappe.db.commit()
