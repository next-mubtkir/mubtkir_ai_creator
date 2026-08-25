frappe.ui.form.on("AI Remote Import", {
    refresh(frm) {
        frm.clear_custom_buttons();
        if (frm.is_new()) return;

        const status = frm.doc.status;

        if (["Pending", "Mapping"].includes(status)) {
            frm.add_custom_button("Start Import", () => {
                frappe.confirm("Start import now?", () => {
                    frappe.call({
                        method: "mubtkir_ai_creator.api.importer.start_import",
                        args: { import_name: frm.doc.name },
                        callback: () => { frappe.show_alert({ message: "Import started", indicator: "green" }); frm.reload_doc(); },
                    });
                });
            }, "Actions").addClass("btn-primary");
        }

        if (["Running", "Queued"].includes(status)) {
            frm.add_custom_button("Cancel Import", () => {
                frappe.confirm("Cancel this import?", () => {
                    frappe.call({
                        method: "mubtkir_ai_creator.api.importer.cancel_import",
                        args: { import_name: frm.doc.name },
                        callback: () => { frappe.show_alert({ message: "Cancelled", indicator: "orange" }); frm.reload_doc(); },
                    });
                });
            }, "Actions").addClass("btn-danger");
            frm._import_interval = setInterval(() => frm.reload_doc(), 5000);
        } else if (frm._import_interval) {
            clearInterval(frm._import_interval);
        }

        if (frm.doc.is_resumable && ["Failed", "Partial Success", "Cancelled"].includes(status)) {
            frm.add_custom_button("Resume", () => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.resume_import",
                    args: { import_name: frm.doc.name },
                    callback: () => { frappe.show_alert({ message: "Import resumed", indicator: "blue" }); frm.reload_doc(); },
                });
            }, "Actions");
        }

        if (frm.doc.failed_rows > 0 && ["Failed", "Partial Success"].includes(status)) {
            frm.add_custom_button("Retry Failed", () => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.retry_failed_rows",
                    args: { import_name: frm.doc.name },
                    callback: (r) => {
                        if (r.message?.retry_import) {
                            frappe.show_alert({ message: "Retry import created: " + r.message.retry_import, indicator: "blue" });
                            frappe.set_route("Form", "AI Remote Import", r.message.retry_import);
                        }
                    },
                });
            }, "Actions");
        }

        frm.add_custom_button("Open Import Wizard", () => frappe.set_route("remote-import"));

        if (["Running", "Queued"].includes(status)) {
            frm.dashboard.add_progress("Progress", frm.doc.progress_percent || 0);
        }

        const colors = { Pending:"orange", Queued:"blue", Running:"blue", Success:"green", "Partial Success":"orange", Failed:"red", Cancelled:"grey" };
        frm.page.set_indicator(status, colors[status] || "grey");

        // Render JSON fields as readable UI
        if (window.mubtkir && mubtkir.renderJsonField) {
            mubtkir.renderJsonField(frm, 'error_log', { type: 'error_list' });
            mubtkir.renderJsonField(frm, 'column_mapping', { type: 'mapping' });
        }
    },

    onload(frm) {
        if (frm.doc.source_file && !frm.doc.source_file_name) {
            frm.set_value("source_file_name", frm.doc.source_file.split("/").pop());
        }
    },
});
