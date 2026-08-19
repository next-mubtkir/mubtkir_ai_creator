frappe.ui.form.on("AI Remote Import", {
    refresh(frm) {
        // Clear old buttons
        frm.clear_custom_buttons();

        if (frm.is_new()) return;

        const status = frm.doc.status;

        // Start Import
        if (["Pending", "Mapping"].includes(status)) {
            frm.add_custom_button(__("بدء الاستيراد"), () => {
                frappe.confirm(
                    __("هل تريد بدء الاستيراد الآن؟"),
                    () => {
                        frappe.call({
                            method: "mubtkir_ai_creator.api.importer.start_import",
                            args: { import_name: frm.doc.name },
                            callback: () => {
                                frappe.show_alert({ message: __("تم بدء الاستيراد"), indicator: "green" });
                                frm.reload_doc();
                            },
                        });
                    }
                );
            }, __("إجراءات")).addClass("btn-primary");
        }

        // Cancel
        if (["Running", "Queued"].includes(status)) {
            frm.add_custom_button(__("إلغاء الاستيراد"), () => {
                frappe.confirm(
                    __("هل تريد إلغاء الاستيراد؟"),
                    () => {
                        frappe.call({
                            method: "mubtkir_ai_creator.api.importer.cancel_import",
                            args: { import_name: frm.doc.name },
                            callback: () => {
                                frappe.show_alert({ message: __("تم الإلغاء"), indicator: "orange" });
                                frm.reload_doc();
                            },
                        });
                    }
                );
            }, __("إجراءات")).addClass("btn-danger");

            // Auto-refresh while running
            frm._import_interval = setInterval(() => frm.reload_doc(), 5000);
        } else if (frm._import_interval) {
            clearInterval(frm._import_interval);
        }

        // Resume
        if (frm.doc.is_resumable && ["Failed", "Partial Success", "Cancelled"].includes(status)) {
            frm.add_custom_button(__("استئناف"), () => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.resume_import",
                    args: { import_name: frm.doc.name },
                    callback: () => {
                        frappe.show_alert({ message: __("تم استئناف الاستيراد"), indicator: "blue" });
                        frm.reload_doc();
                    },
                });
            }, __("إجراءات"));
        }

        // Retry Failed
        if (frm.doc.failed_rows > 0 && ["Failed", "Partial Success"].includes(status)) {
            frm.add_custom_button(__("إعادة الفاشلة"), () => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.retry_failed_rows",
                    args: { import_name: frm.doc.name },
                    callback: (r) => {
                        if (r.message && r.message.retry_import) {
                            frappe.show_alert({
                                message: __("تم إنشاء استيراد جديد: ") + r.message.retry_import,
                                indicator: "blue",
                            });
                            frappe.set_route("Form", "AI Remote Import", r.message.retry_import);
                        }
                    },
                });
            }, __("إجراءات"));
        }

        // Open wizard
        frm.add_custom_button(__("فتح الاستيراد المتقدم"), () => {
            frappe.set_route("remote-import");
        });

        // Progress indicator
        if (["Running", "Queued"].includes(status)) {
            frm.dashboard.add_progress(__("التقدم"), frm.doc.progress_percent || 0);
        }

        // Status indicator
        const indicator_map = {
            "Pending": "orange",
            "Queued": "blue",
            "Running": "blue",
            "Success": "green",
            "Partial Success": "orange",
            "Failed": "red",
            "Cancelled": "grey",
        };
        frm.page.set_indicator(__(status), indicator_map[status] || "grey");
    },

    onload(frm) {
        // Show file name from URL
        if (frm.doc.source_file && !frm.doc.source_file_name) {
            frm.set_value("source_file_name", frm.doc.source_file.split("/").pop());
        }
    },
});
