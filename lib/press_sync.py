"""المزامنة مع تطبيق Press (MUBTKIR Cloud).

تعمل فقط عندما يكون Press مثبتًا على نفس الـ bench. تسحب المواقع وتنشئ
سجلات AI Client Site بالاسم والرابط ومستخدم Administrator، وتترك مفاتيح
API فارغة لتضيفها يدويًا. لا تلمس أي مفاتيح موجودة مسبقًا.
"""

import frappe
from frappe.utils import now_datetime


def is_press_available():
    try:
        return "press" in frappe.get_installed_apps() and frappe.db.exists("DocType", "Site")
    except Exception:
        return False


def _fetch_press_sites():
    fields = ["name", "status"]
    for optional in ("team", "bench", "plan", "domain"):
        if frappe.db.has_column("Site", optional):
            fields.append(optional)

    return frappe.get_all(
        "Site",
        fields=fields,
        filters={"status": ["not in", ["Archived", "Pending"]]},
        order_by="name asc",
        limit_page_length=0,
    )


def sync(create_only_active=True):
    """مزامنة المواقع من Press. تُرجع ملخصًا بما أُنشئ وحُدِّث وتُخطّي."""
    if not is_press_available():
        frappe.throw(
            "تطبيق Press غير مثبت على هذا الـ bench. "
            "المزامنة متاحة فقط على السيرفر الذي يعمل عليه MUBTKIR Cloud."
        )

    sites = _fetch_press_sites()
    created, updated, skipped, needs_key = 0, 0, 0, []

    for site in sites:
        site_name = site.get("name")
        if not site_name:
            continue
        if create_only_active and site.get("status") != "Active":
            skipped += 1
            continue

        site_url = f"https://{site_name}"

        existing = frappe.db.get_value(
            "AI Client Site", {"press_site": site_name}, "name"
        ) or frappe.db.get_value("AI Client Site", {"site_url": site_url}, "name")

        if existing:
            doc = frappe.get_doc("AI Client Site", existing)
            changed = False
            if doc.site_url != site_url:
                doc.site_url = site_url
                changed = True
            if doc.press_site != site_name:
                doc.press_site = site_name
                changed = True
            if not doc.api_user:
                doc.api_user = "Administrator"
                changed = True
            if changed:
                doc.save(ignore_permissions=True)  # المفاتيح لا تُمس إطلاقًا
                updated += 1
            else:
                skipped += 1
        else:
            doc = frappe.get_doc({
                "doctype": "AI Client Site",
                "client_name": site_name,
                "site_url": site_url,
                "api_user": "Administrator",
                "press_site": site_name,
                "is_active": 1,
            })
            doc.insert(ignore_permissions=True)
            created += 1

        if not doc.get_password("api_key", raise_exception=False):
            needs_key.append(doc.name)

    frappe.db.commit()

    return {
        "total_press_sites": len(sites),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "needs_key": needs_key,
        "synced_on": str(now_datetime()),
    }


@frappe.whitelist()
def run_sync(create_only_active=1):
    frappe.only_for(["System Manager", "AI Creator Supervisor"])
    return sync(create_only_active=bool(int(create_only_active)))


@frappe.whitelist()
def press_status():
    return {"available": is_press_available()}
