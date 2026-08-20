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

        // Render formatted error log
        if (frm.doc.error_log && frm.doc.error_log !== "[]") {
            _render_error_table(frm);
        }
    },

    onload(frm) {
        if (frm.doc.source_file && !frm.doc.source_file_name) {
            frm.set_value("source_file_name", frm.doc.source_file.split("/").pop());
        }
    },
});

function _render_error_table(frm) {
    try {
        const errors = JSON.parse(frm.doc.error_log);
        if (!errors.length) return;

        const rows = errors.slice(0, 100).map(e => {
            const msg = _extract_msg(e.error);
            return `<tr style="border-bottom:1px solid var(--border-color)">
                <td style="padding:8px 12px;color:var(--red-500);font-weight:600;white-space:nowrap">Row ${e.row}</td>
                <td style="padding:8px 12px;font-size:13px">${frappe.utils.escape_html(msg)}</td>
            </tr>`;
        }).join("");

        const html = `
            <div style="margin-top:16px">
                <h6 style="margin-bottom:8px">Error Details (${errors.length} errors)</h6>
                <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--border-radius-lg)">
                    <table style="width:100%;border-collapse:collapse">
                        <thead><tr style="background:var(--bg-light-gray)">
                            <th style="padding:8px 12px;text-align:left">Row</th>
                            <th style="padding:8px 12px;text-align:left">Error</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;

        // Replace the raw JSON field with formatted table
        $(frm.fields_dict.error_log.wrapper).find(".like-disabled-input, .control-value").hide();
        const existing = $(frm.fields_dict.error_log.wrapper).find(".ri-error-table-rendered");
        if (existing.length) existing.remove();
        $(frm.fields_dict.error_log.wrapper).append(`<div class="ri-error-table-rendered">${html}</div>`);
    } catch (ex) { /* show raw if parse fails */ }
}

function _extract_msg(raw) {
    if (!raw) return "Unknown error";
    try {
        const m1 = raw.match(/"message":\s*"([^"]+)"/);
        if (m1) return m1[1];
        const m2 = raw.match(/ValidationError:\s*(.+?)(?:\\n|",|$)/);
        if (m2) return m2[1].trim();
        const m3 = raw.match(/OperationalError.*?:\s*(.+?)(?:\\n|$)/);
        if (m3) return m3[1].trim();
        const m4 = raw.match(/"exception":\s*"[^:]+:\s*(.+?)(?:\\n|",|$)/);
        if (m4) return m4[1].trim();
    } catch(e) {}
    return raw.replace(/https?:\/\/[^\s,}]+/g, "").replace(/\\n/g, " ").replace(/\\"/g, '"').substring(0, 200);
}
