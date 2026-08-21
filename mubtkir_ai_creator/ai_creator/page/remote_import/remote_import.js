frappe.pages["remote-import"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Remote Import",
        single_column: true,
    });
    page.main.addClass("remote-import-page");
    new RemoteImportPage(page);
};

class RemoteImportPage {
    constructor(page) {
        this.page = page;
        this.wrapper = page.main;
        this.current_step = 0;
        this.steps = [
            { key: "connect", label: "Connect" },
            { key: "upload", label: "Upload" },
            { key: "mapping", label: "Mapping" },
            { key: "preview", label: "Preview" },
            { key: "import", label: "Import" },
        ];
        this.client_site = null;
        this.remote_doctype = null;
        this.connection_info = null;
        this.file_url = null;
        this.file_data = null;
        this.meta = null;
        this.mapping = {};
        this.import_doc = null;
        this.setup_actions();
        this.render();
    }

    setup_actions() {
        this.page.set_primary_action("Dashboard", () => this.show_dashboard(), "chart-line");
        this.page.set_secondary_action("Import History", () => frappe.set_route("List", "AI Import Log"));
    }

    render() {
        this.wrapper.html("");
        this.render_steps();
        this.render_step_content();
    }

    render_steps() {
        const html = this.steps.map((s, i) => {
            let cls = i === this.current_step ? "active" : i < this.current_step ? "completed" : "";
            return `<div class="ri-step ${cls}" data-step="${i}">
                <span class="ri-step-num">${i < this.current_step ? "✓" : i + 1}</span>
                <span>${s.label}</span>
            </div>`;
        }).join("");
        this.wrapper.append(`<div class="ri-steps">${html}</div>`);
    }

    render_step_content() {
        const container = $('<div class="ri-step-content"></div>').appendTo(this.wrapper);
        const step = this.steps[this.current_step];
        switch (step.key) {
            case "connect": this.render_connect_step(container); break;
            case "upload": this.render_upload_step(container); break;
            case "mapping": this.render_mapping_step(container); break;
            case "preview": this.render_preview_step(container); break;
            case "import": this.render_import_step(container); break;
        }
    }

    go_to_step(n) { this.current_step = n; this.render(); }
    next_step() { if (this.current_step < this.steps.length - 1) this.go_to_step(this.current_step + 1); }
    prev_step() { if (this.current_step > 0) this.go_to_step(this.current_step - 1); }

    // ─── Step 1: Connect ───
    render_connect_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">Select Client & DocType</div>
                <div class="ri-form-row">
                    <div id="ri-client-field"></div>
                    <div id="ri-doctype-field"></div>
                </div>
                <div id="ri-import-type-field" style="max-width:50%"></div>
                <div id="ri-connection-result"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-primary btn-sm" id="ri-btn-test">Test Connection</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-1" disabled>Next →</button>
            </div>
        `);

        this.client_control = frappe.ui.form.make_control({
            parent: container.find("#ri-client-field"),
            df: { fieldname: "client_site", fieldtype: "Link", options: "AI Client Site", label: "Client Site", reqd: 1, get_query: () => ({ filters: { is_active: 1 } }) },
            render_input: true,
        });
        if (this.client_site) this.client_control.set_value(this.client_site);

        this.doctype_control = frappe.ui.form.make_control({
            parent: container.find("#ri-doctype-field"),
            df: { fieldname: "remote_doctype", fieldtype: "Data", label: "Remote DocType", reqd: 1, description: "Type to search available DocTypes" },
            render_input: true,
        });
        if (this.remote_doctype) this.doctype_control.set_value(this.remote_doctype);

        // Autocomplete — trigger on 1 char, preload on focus
        const _loadDT = (term) => {
            const client = this.client_control.get_value();
            if (!client) return;
            frappe.call({
                method: "mubtkir_ai_creator.api.importer.discover_doctypes",
                args: { client_site: client, search_term: term || "" },
                callback: (r) => {
                    if (!r.message) return;
                    const items = r.message.map(d => d.name);
                    this.doctype_control.awesomplete = this.doctype_control.awesomplete ||
                        new Awesomplete(this.doctype_control.$input[0], { minChars: 0, maxItems: 30 });
                    this.doctype_control.awesomplete.list = items;
                    this.doctype_control.awesomplete.evaluate();
                },
            });
        };
        this.doctype_control.$input.on("focus", () => { if (!this.doctype_control.get_value()) _loadDT(""); });
        this.doctype_control.$input.on("input", frappe.utils.debounce(() => {
            const v = this.doctype_control.get_value();
            if (v && v.length >= 1) _loadDT(v);
        }, 300));

        this.import_type_control = frappe.ui.form.make_control({
            parent: container.find("#ri-import-type-field"),
            df: { fieldname: "import_type", fieldtype: "Select", label: "Import Type",
                  options: "Insert\nUpdate\nInsert if Missing\nUpdate if Exists\nSubmit\nCancel\nRename", default: "Insert" },
            render_input: true,
        });

        container.find("#ri-btn-test").on("click", () => this.test_connection(container));
        container.find("#ri-btn-next-1").on("click", () => {
            this.client_site = this.client_control.get_value();
            this.remote_doctype = this.doctype_control.get_value();
            this.import_type = this.import_type_control.get_value();
            if (!this.client_site || !this.remote_doctype) { frappe.msgprint("Please select a client and DocType"); return; }
            this.next_step();
        });
    }

    test_connection(container) {
        const client = this.client_control.get_value();
        if (!client) { frappe.msgprint("Please select a client first"); return; }
        const rd = container.find("#ri-connection-result");
        rd.html(`<div class="text-muted" style="padding:12px">Testing connection...</div>`);
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.test_connection",
            args: { client_site: client },
            callback: (r) => {
                const info = r.message;
                this.connection_info = info;
                if (info.status === "Connected") {
                    rd.html(`<div class="ri-connection-status success"><span>✓</span><div>
                        <strong>Connected</strong>
                        <div style="font-size:12px">User: ${info.user} | ERPNext: ${info.versions?.erpnext||"—"} | Frappe: ${info.versions?.frappe||"—"} | Latency: ${info.latency_ms}ms</div>
                    </div></div>`);
                    container.find("#ri-btn-next-1").prop("disabled", false);
                } else {
                    rd.html(`<div class="ri-connection-status error"><span>✗</span><div>
                        <strong>Connection Failed</strong>
                        <div style="font-size:12px">${info.error||""}</div>
                    </div></div>`);
                }
            },
        });
    }

    // ─── Step 2: Upload ───
    render_upload_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">Upload Data File</div>
                <div id="ri-file-upload-area">
                    <div class="ri-upload-zone" id="ri-drop-zone" style="cursor:pointer">
                        <div style="font-size:36px;margin-bottom:8px">📁</div>
                        <div style="font-weight:600">Click to select an Excel or CSV file</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">.xlsx, .xls, .csv</div>
                    </div>
                </div>
                <div id="ri-file-info" style="margin-top:12px"></div>
                <div style="margin-top:16px;text-align:center">
                    <button class="btn btn-xs btn-default" id="ri-btn-download-template">⬇ Download Import Template</button>
                </div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-2">← Back</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-2" disabled>Next →</button>
            </div>
        `);

        container.find("#ri-drop-zone").on("click", () => {
            new frappe.ui.FileUploader({
                restrictions: { allowed_file_types: [".xlsx", ".xls", ".csv"] },
                on_success: (file_doc) => {
                    this.file_url = file_doc.file_url;
                    this.file_name = file_doc.file_name;
                    container.find("#ri-drop-zone").addClass("has-file").html(`
                        <div style="font-size:36px;margin-bottom:8px">✅</div>
                        <div style="font-weight:600">${frappe.utils.escape_html(file_doc.file_name)}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Click to change file</div>
                    `);
                    container.find("#ri-btn-next-2").prop("disabled", false);
                },
            });
        });

        container.find("#ri-btn-download-template").on("click", () => {
            window.open(`/api/method/mubtkir_ai_creator.api.importer.download_template?client_site=${encodeURIComponent(this.client_site)}&doctype=${encodeURIComponent(this.remote_doctype)}`);
        });
        container.find("#ri-btn-prev-2").on("click", () => this.prev_step());
        container.find("#ri-btn-next-2").on("click", () => {
            if (!this.file_url) { frappe.msgprint("Please upload a file first"); return; }
            this.load_metadata_and_preview().then(() => this.next_step());
        });
    }

    async load_metadata_and_preview() {
        const meta_resp = await frappe.call({ method: "mubtkir_ai_creator.api.importer.get_doctype_meta", args: { client_site: this.client_site, doctype: this.remote_doctype } });
        this.meta = meta_resp.message;
        const preview_resp = await frappe.call({ method: "mubtkir_ai_creator.api.importer.preview_file", args: { file_url: this.file_url, limit: 5 } });
        this.file_data = preview_resp.message;
        const map_resp = await frappe.call({ method: "mubtkir_ai_creator.api.importer.auto_map", args: { client_site: this.client_site, doctype: this.remote_doctype, file_columns: JSON.stringify(this.file_data.headers) } });
        this.mapping = map_resp.message || {};
    }

    // ─── Step 3: Mapping ───
    render_mapping_step(container) {
        if (!this.meta || !this.file_data) {
            container.html(`<div class="text-muted">Loading metadata...</div>`);
            this.load_metadata_and_preview().then(() => this.render_mapping_step(container));
            return;
        }

        const field_options = [{ value: "", label: "— Skip —" }];
        for (const f of this.meta.fields) {
            const reqd = f.reqd ? " *" : "";
            field_options.push({ value: f.fieldname, label: `${f.label || f.fieldname}${reqd} (${f.fieldtype})` });
        }
        for (const [table_fn, table_info] of Object.entries(this.meta.child_tables || {})) {
            for (const cf of table_info.fields) {
                field_options.push({ value: `${table_fn}.${cf.fieldname}`, label: `↳ ${table_info.label||table_fn} → ${cf.label||cf.fieldname} (${cf.fieldtype})` });
            }
        }

        const mapping_rows = this.file_data.headers.map(h => {
            const mapped = this.mapping[h] || "";
            const opts = field_options.map(o => `<option value="${o.value}" ${o.value===mapped?"selected":""}>${o.label}</option>`).join("");
            return `<tr>
                <td style="font-weight:600">${frappe.utils.escape_html(h)}</td>
                <td class="ri-mapping-arrow">→</td>
                <td><select class="ri-mapping-select" data-source="${frappe.utils.escape_html(h)}">${opts}</select></td>
            </tr>`;
        }).join("");

        container.html(`
            <div class="ri-panel">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div class="ri-panel-title" style="margin:0">Field Mapping</div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-xs btn-default" id="ri-btn-load-mapping">Load Mapping</button>
                        <button class="btn btn-xs btn-default" id="ri-btn-save-mapping">Save Mapping</button>
                    </div>
                </div>
                <table class="ri-mapping-table">
                    <thead><tr><th style="width:35%">File Column</th><th style="width:5%"></th><th style="width:60%">Target Field</th></tr></thead>
                    <tbody>${mapping_rows}</tbody>
                </table>
                <div id="ri-unmapped-warning" style="margin-top:12px"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-3">← Back</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-3">Next →</button>
            </div>
        `);

        container.find(".ri-mapping-select").on("change", e => {
            this.mapping[$(e.target).data("source")] = $(e.target).val() || null;
            this.check_unmapped(container);
        });
        container.find("#ri-btn-save-mapping").on("click", () => this.save_mapping_dialog());
        container.find("#ri-btn-load-mapping").on("click", () => this.load_mapping_dialog());
        container.find("#ri-btn-prev-3").on("click", () => this.prev_step());
        container.find("#ri-btn-next-3").on("click", () => this.next_step());
        this.check_unmapped(container);
    }

    check_unmapped(container) {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_unmapped_required",
            args: { client_site: this.client_site, doctype: this.remote_doctype, current_mapping: JSON.stringify(this.mapping) },
            callback: (r) => {
                const unmapped = r.message || [];
                const w = container.find("#ri-unmapped-warning");
                if (unmapped.length) {
                    const fields = unmapped.map(f => f.label || f.fieldname).join(", ");
                    w.html(`<div class="text-warning" style="font-size:13px">⚠ Unmapped required fields: ${fields}</div>`);
                } else {
                    w.html(`<div class="text-success" style="font-size:13px">✓ All required fields are mapped</div>`);
                }
            },
        });
    }

    save_mapping_dialog() {
        const d = new frappe.ui.Dialog({
            title: "Save Mapping",
            fields: [
                { fieldname: "title", fieldtype: "Data", label: "Mapping Name", reqd: 1 },
                { fieldname: "is_default", fieldtype: "Check", label: "Default Mapping" },
                { fieldname: "notes", fieldtype: "Small Text", label: "Notes" },
            ],
            primary_action_label: "Save",
            primary_action: (v) => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.save_mapping",
                    args: { mapping_title: v.title, client_site: this.client_site, doctype: this.remote_doctype, mapping_data: JSON.stringify(this.mapping), is_default: v.is_default?1:0, notes: v.notes||"" },
                    callback: () => { frappe.show_alert({ message: "Mapping saved", indicator: "green" }); d.hide(); },
                });
            },
        });
        d.show();
    }

    load_mapping_dialog() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.list_mappings",
            args: { client_site: this.client_site, doctype: this.remote_doctype },
            callback: (r) => {
                const mappings = r.message || [];
                if (!mappings.length) { frappe.msgprint("No saved mappings for this DocType"); return; }
                const d = new frappe.ui.Dialog({
                    title: "Load Mapping",
                    fields: [{ fieldname: "mapping", fieldtype: "Select", label: "Mapping", options: mappings.map(m=>m.mapping_title).join("\n"), reqd: 1 }],
                    primary_action_label: "Load",
                    primary_action: (v) => {
                        frappe.call({
                            method: "mubtkir_ai_creator.api.importer.load_mapping",
                            args: { mapping_name: v.mapping },
                            callback: (r2) => { this.mapping = r2.message.mapping_data || {}; d.hide(); this.render(); },
                        });
                    },
                });
                d.show();
            },
        });
    }

    // ─── Step 4: Preview ───
    render_preview_step(container) {
        if (!this.file_data) return;
        const mapped = this.file_data.headers.filter(h => this.mapping[h]);
        const th = mapped.map(h => `<th>${frappe.utils.escape_html(this.mapping[h])}</th>`).join("");
        const rows = (this.file_data.rows||[]).slice(0,20).map(row => {
            const cells = mapped.map(h => { const idx = this.file_data.headers.indexOf(h); return `<td>${frappe.utils.escape_html(idx<row.length?row[idx]:"")}</td>`; }).join("");
            return `<tr>${cells}</tr>`;
        }).join("");

        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">Data Preview <span style="font-weight:normal;color:var(--text-muted);font-size:12px">(${this.file_data.total_rows} rows — showing ${Math.min(20,this.file_data.total_rows)})</span></div>
                <div class="ri-preview-wrapper"><table class="ri-preview-table"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
            </div>
            <div class="ri-panel">
                <div class="ri-panel-title">Import Options</div>
                <div id="ri-import-options"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-4">← Back</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-start-import">Start Import ⚡</button>
            </div>
        `);
        this.render_import_options(container.find("#ri-import-options"));
        container.find("#ri-btn-prev-4").on("click", () => this.prev_step());
        container.find("#ri-btn-start-import").on("click", () => this.create_and_start_import());
    }

    render_import_options(container) {
        const opts = [
            { key: "submit_after_import", label: "Submit After Import", def: false },
            { key: "skip_failed_rows", label: "Skip Failed Rows", def: true },
            { key: "send_emails", label: "Send Emails", def: false },
            { key: "ignore_empty_values", label: "Ignore Empty Values", def: true },
            { key: "ignore_link_validation", label: "Ignore Link Validation", def: false },
            { key: "update_child_tables", label: "Update Child Tables", def: false },
            { key: "import_attachments", label: "Import Attachments", def: false },
            { key: "run_as_background_job", label: "Run as Background Job", def: true },
        ];
        this.import_options = {};
        const html = opts.map(o => { this.import_options[o.key] = o.def; return `<label class="ri-option-item"><input type="checkbox" data-key="${o.key}" ${o.def?"checked":""}><span>${o.label}</span></label>`; }).join("");
        container.html(`<div class="ri-options-grid">${html}</div>
            <div style="margin-top:12px"><label style="font-size:13px">Batch Size: <input type="number" id="ri-batch-size" value="200" min="10" max="5000" style="width:80px;margin-right:8px" class="input-with-feedback form-control input-xs"></label></div>`);
        container.find("input[type=checkbox]").on("change", e => { this.import_options[$(e.target).data("key")] = e.target.checked; });
    }

    async create_and_start_import() {
        const batch_size = parseInt($("#ri-batch-size").val()) || 200;
        const doc_data = {
            doctype: "AI Remote Import", client_site: this.client_site, remote_doctype: this.remote_doctype,
            import_type: this.import_type || "Insert", source_file: this.file_url,
            source_file_name: this.file_url ? this.file_url.split("/").pop() : "",
            column_mapping: JSON.stringify(this.mapping), batch_size, total_rows: this.file_data.total_rows,
            ...this.import_options,
        };
        try {
            const resp = await frappe.call({ method: "frappe.client.insert", args: { doc: doc_data } });
            this.import_doc = resp.message;
            // Show progress page immediately — don't wait for import to start
            this.next_step();
            // Fire start_import without awaiting — polling/realtime will track progress
            frappe.call({ method: "mubtkir_ai_creator.api.importer.start_import", args: { import_name: this.import_doc.name } });
        } catch (e) {
            frappe.msgprint({ title: "Error", message: e.message || "Failed to start import", indicator: "red" });
        }
    }

    // ─── Step 5: Progress ───
    render_import_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">Import Progress — ${this.import_doc?.name||""}</div>
                <div class="ri-progress-container">
                    <div class="ri-progress-bar-wrapper">
                        <div class="ri-progress-bar" id="ri-pbar" style="width:0%"></div>
                        <div class="ri-progress-text" id="ri-ptext">0%</div>
                    </div>
                </div>
                <div class="ri-progress-stats">
                    <div class="ri-stat success"><div class="ri-stat-value" id="ri-stat-imported">0</div><div class="ri-stat-label">Imported</div></div>
                    <div class="ri-stat error"><div class="ri-stat-value" id="ri-stat-failed">0</div><div class="ri-stat-label">Failed</div></div>
                    <div class="ri-stat warning"><div class="ri-stat-value" id="ri-stat-skipped">0</div><div class="ri-stat-label">Skipped</div></div>
                    <div class="ri-stat"><div class="ri-stat-value" id="ri-stat-total">${this.file_data?.total_rows||0}</div><div class="ri-stat-label">Total</div></div>
                    <div class="ri-stat"><div class="ri-stat-value" id="ri-stat-batch">0/0</div><div class="ri-stat-label">Batch</div></div>
                </div>
                <div id="ri-import-status" style="margin-top:16px;text-align:center"></div>
            </div>
            <div id="ri-error-panel"></div>
            <div class="ri-actions">
                <button class="btn btn-danger btn-sm" id="ri-btn-cancel-import">Cancel</button>
                <button class="btn btn-default btn-sm" id="ri-btn-new-import" style="display:none">New Import</button>
                <button class="btn btn-warning btn-sm" id="ri-btn-retry" style="display:none">Retry Failed</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-resume" style="display:none">Resume</button>
            </div>
        `);
        container.find("#ri-btn-cancel-import").on("click", () => this.cancel_import());
        container.find("#ri-btn-new-import").on("click", () => { this.current_step=0; this.import_doc=null; this.render(); });
        container.find("#ri-btn-retry").on("click", () => this.retry_import());
        container.find("#ri-btn-resume").on("click", () => this.resume_import());
        this.start_progress_polling();
    }

    start_progress_polling() {
        if (!this.import_doc) return;
        frappe.realtime.on("import_progress", d => { if (d.import_name===this.import_doc.name) this.update_progress_ui(d); });
        frappe.realtime.on("import_complete", d => { if (d.import_name===this.import_doc.name) this.on_import_complete(d); });
        this._poll_timer = setInterval(() => {
            frappe.call({
                method: "mubtkir_ai_creator.api.importer.get_import_status",
                args: { import_name: this.import_doc.name },
                callback: (r) => {
                    const d = r.message;
                    this.update_progress_ui(d);
                    if (["Success","Failed","Partial Success","Cancelled"].includes(d.status)) this.on_import_complete(d);
                },
            });
        }, 3000);
    }

    update_progress_ui(d) {
        const pct = d.progress_percent || 0;
        $("#ri-pbar").css("width", pct+"%");
        $("#ri-ptext").text(Math.round(pct)+"%");
        $("#ri-stat-imported").text(d.imported_rows ?? d.imported ?? 0);
        $("#ri-stat-failed").text(d.failed_rows ?? d.failed ?? 0);
        $("#ri-stat-skipped").text(d.skipped_rows ?? d.skipped ?? 0);
        if (d.total_rows) $("#ri-stat-total").text(d.total_rows);
        if (d.current_batch !== undefined) $("#ri-stat-batch").text(`${d.current_batch}/${d.total_batches||"?"}`);
    }

    on_import_complete(d) {
        if (this._poll_timer) { clearInterval(this._poll_timer); this._poll_timer=null; }
        const status = d.status;
        let icon="✓", color="green";
        if (status==="Failed") { icon="✗"; color="red"; }
        else if (status==="Partial Success") { icon="⚠"; color="orange"; }
        else if (status==="Cancelled") { icon="⊘"; color="grey"; }

        // Final fetch to get accurate numbers
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_import_status",
            args: { import_name: this.import_doc.name },
            callback: (r) => { if (r.message) this.update_progress_ui(r.message); },
        });

        $("#ri-import-status").html(`<div style="font-size:18px;font-weight:700;color:var(--${color}-600)">${icon} ${status}</div>`);
        $("#ri-btn-cancel-import").hide();
        $("#ri-btn-new-import").show();
        if (status==="Failed"||status==="Partial Success") { $("#ri-btn-retry").show(); if (d.is_resumable) $("#ri-btn-resume").show(); this.load_errors(); }
    }

    load_errors() {
        frappe.call({
            method: "frappe.client.get",
            args: { doctype: "AI Remote Import", name: this.import_doc.name },
            callback: (r) => {
                const error_log = r.message.error_log;
                if (!error_log) return;
                try {
                    const errors = JSON.parse(error_log);
                    if (!errors.length) return;
                    // Format errors as a readable table
                    const rows = errors.slice(0,50).map(e => {
                        const msg = this._extract_error_message(e.error);
                        return `<tr>
                            <td style="color:var(--red-500);font-weight:600;white-space:nowrap;padding:8px 12px">Row ${e.row}</td>
                            <td style="padding:8px 12px">${frappe.utils.escape_html(msg)}</td>
                        </tr>`;
                    }).join("");
                    $("#ri-error-panel").html(`
                        <div class="ri-panel">
                            <div class="ri-panel-title">Errors (${errors.length})</div>
                            <div style="max-height:350px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--border-radius)">
                                <table style="width:100%;font-size:13px;border-collapse:collapse">
                                    <thead><tr style="background:var(--bg-light-gray)">
                                        <th style="padding:8px 12px;text-align:left">Row</th>
                                        <th style="padding:8px 12px;text-align:left">Error</th>
                                    </tr></thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>
                        </div>
                    `);
                } catch (ex) { /* ignore */ }
            },
        });
    }

    _extract_error_message(raw) {
        // Extract readable error from raw API error string
        if (!raw) return "Unknown error";
        const translations = {
            '1292': 'Incorrect date/time/number format — check field type',
            '1062': 'Duplicate entry — record already exists',
            '1048': 'Required field is empty (NOT NULL)',
            '1452': 'Invalid link — referenced record not found',
            '1406': 'Value too long for field',
            '1264': 'Value out of range for field',
            '1054': 'Unknown column — field does not exist',
            '1146': 'Table does not exist — DocType may not be installed',
        };
        try {
            // Try _server_messages first
            const smMatch = raw.match(/"message":\s*"([^"]+)"/);
            if (smMatch) return smMatch[1];
            // ValidationError / LinkValidationError
            let m = raw.match(/(?:Validation|LinkValidation)Error:\s*(.+?)(?:\\n|",|$)/);
            if (m) return m[1].trim();
            // OperationalError — match even truncated
            m = raw.match(/OperationalError[:\s]*\((\d+)/);
            if (m) {
                const code = m[1];
                const valMatch = raw.match(/'([^']{1,80})'/);
                const detail = valMatch ? ' (value: ' + valMatch[1] + ')' : '';
                return (translations[code] || 'Database error (' + code + ')') + detail;
            }
            // Generic exception
            const jsonMatch = raw.match(/\{"exception":\s*"([^"]+)"/);
            if (jsonMatch) {
                return jsonMatch[1].replace(/^[\w.]+Exception:\s*/, "");
            }
            // Unicode escape decode
            if (raw.includes("\\u0")) {
                try { return JSON.parse('"' + raw.replace(/"/g, '\\"') + '"'); } catch(e) {}
            }
        } catch (e) { /* fall through */ }
        return raw.replace(/https?:\/\/[^\s]+/g, "").replace(/\\n/g, " ").replace(/\\"/g, '"').substring(0, 300);
    }

    cancel_import() {
        frappe.confirm("Cancel this import?", () => {
            frappe.call({ method: "mubtkir_ai_creator.api.importer.cancel_import", args: { import_name: this.import_doc.name }, callback: () => this.on_import_complete({ status: "Cancelled" }) });
        });
    }

    resume_import() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.resume_import",
            args: { import_name: this.import_doc.name },
            callback: () => { frappe.show_alert({ message: "Import resumed", indicator: "blue" }); this.render_import_step(this.wrapper.find(".ri-step-content")); },
        });
    }

    retry_import() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.retry_failed_rows",
            args: { import_name: this.import_doc.name },
            callback: (r) => {
                if (r.message?.retry_import) {
                    this.import_doc = { name: r.message.retry_import };
                    frappe.show_alert({ message: "Retry import created", indicator: "blue" });
                    this.render_import_step(this.wrapper.find(".ri-step-content"));
                }
            },
        });
    }

    // ─── Dashboard ───
    show_dashboard() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_dashboard",
            callback: (r) => {
                const d = r.message;
                this.wrapper.html("");
                const top_dt = (d.top_doctypes||[]).map(x => `<tr><td>${x.remote_doctype}</td><td>${x.cnt}</td><td>${x.total_imported}</td></tr>`).join("");
                const top_cl = (d.top_clients||[]).map(x => `<tr><td>${x.client_site}</td><td>${x.cnt}</td><td>${x.total_imported}</td></tr>`).join("");
                this.wrapper.html(`
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                        <h3>Remote Import Dashboard</h3>
                        <button class="btn btn-primary btn-sm" id="ri-btn-back-wizard">← New Import</button>
                    </div>
                    <div class="ri-dashboard-grid">
                        <div class="ri-dashboard-card"><div class="value">${d.total_imports}</div><div class="label">Total Imports</div></div>
                        <div class="ri-dashboard-card"><div class="value" style="color:var(--green-600)">${d.successful}</div><div class="label">Successful</div></div>
                        <div class="ri-dashboard-card"><div class="value" style="color:var(--red-600)">${d.failed}</div><div class="label">Failed</div></div>
                        <div class="ri-dashboard-card"><div class="value">${d.avg_speed}</div><div class="label">Avg Speed (rows/sec)</div></div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                        <div class="ri-panel"><div class="ri-panel-title">Top DocTypes</div><table class="ri-preview-table" style="white-space:normal"><thead><tr><th>DocType</th><th>Count</th><th>Rows</th></tr></thead><tbody>${top_dt||'<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody></table></div>
                        <div class="ri-panel"><div class="ri-panel-title">Top Clients</div><table class="ri-preview-table" style="white-space:normal"><thead><tr><th>Client</th><th>Count</th><th>Rows</th></tr></thead><tbody>${top_cl||'<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody></table></div>
                    </div>
                `);
                this.wrapper.find("#ri-btn-back-wizard").on("click", () => { this.current_step=0; this.render(); });
            },
        });
    }
}
