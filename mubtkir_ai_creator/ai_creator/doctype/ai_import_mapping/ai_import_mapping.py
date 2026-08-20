import json

import frappe
from frappe.model.document import Document


class AIImportMapping(Document):
    def validate(self):
        if self.mapping_data:
            try:
                json.loads(self.mapping_data)
            except (json.JSONDecodeError, TypeError):
                frappe.throw("Mapping data must be valid JSON")
