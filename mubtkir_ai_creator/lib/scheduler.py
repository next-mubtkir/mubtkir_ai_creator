"""تنفيذ المهام المجدولة التي وصل وقتها."""

import frappe
from frappe.utils import now_datetime, get_datetime


def execute_scheduled_tasks():
    now = now_datetime()
    tasks = frappe.get_all(
        "AI Task",
        filters={
            "status": "Approved",
            "scheduled_time": ["<=", now],
        },
        fields=["name"],
        order_by="scheduled_time asc",
        limit_page_length=10,
    )

    for task in tasks:
        try:
            from mubtkir_ai_creator.lib.agent import execute_task
            execute_task(task.name)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"AI Creator scheduled task failed: {task.name}",
            )
