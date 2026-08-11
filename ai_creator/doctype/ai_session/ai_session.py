import json

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class AISession(Document):
    def before_insert(self):
        self.session_user = frappe.session.user
        self.started_on = now_datetime()
        if not self.messages:
            self.messages = "[]"

    def validate(self):
        # قفل الجلسة على الموقع: منع تغيير العميل بعد الإنشاء
        if not self.is_new():
            before = self.get_doc_before_save()
            if before and before.client_site != self.client_site:
                frappe.throw("لا يمكن تغيير العميل بعد بدء الجلسة")

    def get_messages(self):
        try:
            return json.loads(self.messages or "[]")
        except (ValueError, TypeError):
            return []

    def append_message(self, role, content):
        msgs = self.get_messages()
        msgs.append({"role": role, "content": content})
        self.db_set("messages", json.dumps(msgs, ensure_ascii=False), update_modified=True)
