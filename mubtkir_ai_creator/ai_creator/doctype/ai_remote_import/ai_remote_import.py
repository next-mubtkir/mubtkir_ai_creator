"""AI Remote Import — central document for remote data import operations."""

import json

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class AIRemoteImport(Document):
    def validate(self):
        if not self.source_file and not self.google_sheet_url:
            frappe.throw("يجب رفع ملف أو إدخال رابط Google Sheet")

        if self.batch_size and self.batch_size < 10:
            frappe.throw("حجم الدفعة يجب أن يكون 10 على الأقل")

        if self.column_mapping:
            try:
                json.loads(self.column_mapping)
            except (json.JSONDecodeError, TypeError):
                frappe.throw("خريطة الأعمدة يجب أن تكون JSON صالح")

    def before_insert(self):
        self.started_by = frappe.session.user

    def start_import(self):
        """Mark import as running."""
        self.db_set("status", "Running")
        self.db_set("started_on", now_datetime())

    def finish_import(self, status="Success"):
        """Mark import as finished."""
        self.db_set("status", status)
        self.db_set("finished_on", now_datetime())
        started = self.started_on or now_datetime()
        finished = now_datetime()
        diff = (finished - started).total_seconds() if hasattr(started, "total_seconds") else 0
        self.db_set("duration", diff)

        if self.imported_rows and self.imported_rows < self.total_rows:
            self.db_set("is_resumable", 1)

    def update_progress(self, imported=0, failed=0, skipped=0, current_batch=0):
        """Update progress counters."""
        self.db_set("imported_rows", imported)
        self.db_set("failed_rows", failed)
        self.db_set("skipped_rows", skipped)
        self.db_set("current_batch", current_batch)
        total = self.total_rows or 1
        self.db_set("progress_percent", round((imported + failed + skipped) / total * 100, 1))

    def append_error(self, row_num, error_msg):
        """Append an error to the error log."""
        errors = []
        if self.error_log:
            try:
                errors = json.loads(self.error_log)
            except (json.JSONDecodeError, TypeError):
                errors = []
        errors.append({"row": row_num, "error": str(error_msg)[:500]})
        # Keep last 1000 errors max
        self.db_set("error_log", json.dumps(errors[-1000:], ensure_ascii=False))
