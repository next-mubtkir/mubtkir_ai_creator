frappe.pages["remote-import"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Remote Import"),
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
            { key: "connect", label: __("اتصال"), icon: "link" },
            { key: "upload", label: __("رفع الملف"), icon: "upload" },
            { key: "mapping", label: __("الربط"), icon: "columns" },
            { key: "preview", label: __("معاينة"), icon: "eye" },
            { key: "import", label: __("استيراد"), icon: "play" },
        ];

        // State
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
        this.page.set_primary_action(__("Dashboard"), () => this.show_dashboard(), "chart-line");
        this.page.set_secondary_action(__("Import History"), () =>
            frappe.set_route("List", "AI Import Log")
        );
    }

    render() {
        this.wrapper.html("");
        this.render_steps();
        this.render_step_content();
    }

    // ─── Step Indicator ───

    render_steps() {
        const html = this.steps
            .map((s, i) => {
                let cls = "";
                if (i === this.current_step) cls = "active";
                else if (i < this.current_step) cls = "completed";
                return `<div class="ri-step ${cls}" data-step="${i}">
                    <span class="ri-step-num">${i < this.current_step ? "✓" : i + 1}</span>
                    <span>${s.label}</span>
                </div>`;
            })
            .join("");

        this.wrapper.append(`<div class="ri-steps">${html}</div>`);
    }

    render_step_content() {
        const step = this.steps[this.current_step];
        const container = $('<div class="ri-step-content"></div>').appendTo(this.wrapper);

        switch (step.key) {
            case "connect":
                this.render_connect_step(container);
                break;
            case "upload":
                this.render_upload_step(container);
                break;
            case "mapping":
                this.render_mapping_step(container);
                break;
            case "preview":
                this.render_preview_step(container);
                break;
            case "import":
                this.render_import_step(container);
                break;
        }
    }

    go_to_step(step_num) {
        this.current_step = step_num;
        this.render();
    }

    next_step() {
        if (this.current_step < this.steps.length - 1) {
            this.go_to_step(this.current_step + 1);
        }
    }

    prev_step() {
        if (this.current_step > 0) {
            this.go_to_step(this.current_step - 1);
        }
    }

    // ─── Step 1: Connect ───

    render_connect_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">${__("اختيار العميل والجدول")}</div>
                <div class="ri-form-row">
                    <div id="ri-client-field"></div>
                    <div id="ri-doctype-field"></div>
                </div>
                <div id="ri-import-type-field" style="max-width:50%"></div>
                <div id="ri-connection-result"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-primary btn-sm" id="ri-btn-test">${__("فحص الاتصال")}</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-1" disabled>${__("التالي ←")}</button>
            </div>
        `);

        // Client selector
        this.client_control = frappe.ui.form.make_control({
            parent: container.find("#ri-client-field"),
            df: {
                fieldname: "client_site",
                fieldtype: "Link",
                options: "AI Client Site",
                label: __("العميل"),
                reqd: 1,
                get_query: () => ({ filters: { is_active: 1 } }),
            },
            render_input: true,
        });
        if (this.client_site) this.client_control.set_value(this.client_site);

        // DocType field (Autocomplete — loads from remote)
        this.doctype_control = frappe.ui.form.make_control({
            parent: container.find("#ri-doctype-field"),
            df: {
                fieldname: "remote_doctype",
                fieldtype: "Data",
                label: __("DocType (الجدول)"),
                reqd: 1,
                description: __("اكتب للبحث في الجداول المتاحة"),
            },
            render_input: true,
        });
        if (this.remote_doctype) this.doctype_control.set_value(this.remote_doctype);

        // Autocomplete for doctype
        this.doctype_control.$input.on("input", frappe.utils.debounce(() => {
            const val = this.doctype_control.get_value();
            const client = this.client_control.get_value();
            if (!client || !val || val.length < 2) return;

            frappe.call({
                method: "mubtkir_ai_creator.api.importer.discover_doctypes",
                args: { client_site: client, search_term: val },
                callback: (r) => {
                    if (r.message) {
                        const items = r.message.map((d) => d.name);
                        this.doctype_control.awesomplete =
                            this.doctype_control.awesomplete ||
                            new Awesomplete(this.doctype_control.$input[0], { minChars: 1, maxItems: 20 });
                        this.doctype_control.awesomplete.list = items;
                        this.doctype_control.awesomplete.evaluate();
                    }
                },
            });
        }, 300));

        // Import type
        this.import_type_control = frappe.ui.form.make_control({
            parent: container.find("#ri-import-type-field"),
            df: {
                fieldname: "import_type",
                fieldtype: "Select",
                label: __("نوع الاستيراد"),
                options: "Insert\nUpdate\nInsert if Missing\nUpdate if Exists\nSubmit\nCancel\nRename",
                default: "Insert",
            },
            render_input: true,
        });

        // Test connection button
        container.find("#ri-btn-test").on("click", () => this.test_connection(container));
        container.find("#ri-btn-next-1").on("click", () => {
            this.client_site = this.client_control.get_value();
            this.remote_doctype = this.doctype_control.get_value();
            this.import_type = this.import_type_control.get_value();
            if (!this.client_site || !this.remote_doctype) {
                frappe.msgprint(__("يرجى اختيار العميل والجدول"));
                return;
            }
            this.next_step();
        });
    }

    test_connection(container) {
        const client = this.client_control.get_value();
        if (!client) {
            frappe.msgprint(__("يرجى اختيار العميل أولاً"));
            return;
        }

        const result_div = container.find("#ri-connection-result");
        result_div.html(`<div class="text-muted" style="padding:12px">${__("جاري فحص الاتصال...")}</div>`);

        frappe.call({
            method: "mubtkir_ai_creator.api.importer.test_connection",
            args: { client_site: client },
            callback: (r) => {
                const info = r.message;
                this.connection_info = info;

                if (info.status === "Connected") {
                    result_div.html(`
                        <div class="ri-connection-status success">
                            <span>✓</span>
                            <div>
                                <strong>${__("متصل بنجاح")}</strong>
                                <div style="font-size:12px">
                                    ${__("المستخدم")}: ${info.user} &nbsp;|&nbsp;
                                    ERPNext: ${info.versions?.erpnext || "—"} &nbsp;|&nbsp;
                                    Frappe: ${info.versions?.frappe || "—"} &nbsp;|&nbsp;
                                    ${__("زمن الاستجابة")}: ${info.latency_ms}ms
                                </div>
                            </div>
                        </div>
                    `);
                    container.find("#ri-btn-next-1").prop("disabled", false);
                } else {
                    result_div.html(`
                        <div class="ri-connection-status error">
                            <span>✗</span>
                            <div>
                                <strong>${__("فشل الاتصال")}</strong>
                                <div style="font-size:12px">${info.error || ""}</div>
                            </div>
                        </div>
                    `);
                }
            },
        });
    }

    // ─── Step 2: Upload ───

    render_upload_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">${__("رفع ملف البيانات")}</div>
                <div id="ri-file-upload-area"></div>
                <div style="margin-top:16px; text-align:center">
                    <button class="btn btn-xs btn-default" id="ri-btn-download-template">
                        ${__("⬇ تحميل قالب الاستيراد")}
                    </button>
                </div>
                <div id="ri-file-info" style="margin-top:12px"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-2">${__("← السابق")}</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-2" disabled>${__("التالي ←")}</button>
            </div>
        `);

        // File upload control
        this.file_control = frappe.ui.form.make_control({
            parent: container.find("#ri-file-upload-area"),
            df: {
                fieldname: "source_file",
                fieldtype: "Attach",
                label: __("ملف Excel أو CSV"),
            },
            render_input: true,
        });

        this.file_control.$input &&
            this.file_control.$input.on("change", () => {
                setTimeout(() => this.on_file_attached(container), 500);
            });

        // Poll for file attachment
        this.file_control.on_upload_complete = (attachment) => {
            this.file_url = attachment.file_url;
            this.on_file_attached(container);
        };

        // Also handle when value changes
        const orig_set = this.file_control.set_value.bind(this.file_control);
        this.file_control.set_value = (val) => {
            orig_set(val);
            if (val) {
                this.file_url = val;
                this.on_file_attached(container);
            }
        };

        // Download template
        container.find("#ri-btn-download-template").on("click", () => {
            window.open(
                `/api/method/mubtkir_ai_creator.api.importer.download_template?client_site=${encodeURIComponent(this.client_site)}&doctype=${encodeURIComponent(this.remote_doctype)}`
            );
        });

        container.find("#ri-btn-prev-2").on("click", () => this.prev_step());
        container.find("#ri-btn-next-2").on("click", () => {
            if (!this.file_url) {
                frappe.msgprint(__("يرجى رفع ملف أولاً"));
                return;
            }
            this.load_metadata_and_preview().then(() => this.next_step());
        });
    }

    on_file_attached(container) {
        const val = this.file_control.get_value();
        if (val) {
            this.file_url = val;
            container.find("#ri-file-info").html(
                `<div class="text-success" style="font-size:13px">✓ ${__("تم رفع الملف")}: ${val.split("/").pop()}</div>`
            );
            container.find("#ri-btn-next-2").prop("disabled", false);
        }
    }

    async load_metadata_and_preview() {
        // Load remote metadata
        const meta_resp = await frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_doctype_meta",
            args: { client_site: this.client_site, doctype: this.remote_doctype },
        });
        this.meta = meta_resp.message;

        // Parse file preview
        const preview_resp = await frappe.call({
            method: "mubtkir_ai_creator.api.importer.preview_file",
            args: { file_url: this.file_url, limit: 5 },
        });
        this.file_data = preview_resp.message;

        // Auto-map
        const map_resp = await frappe.call({
            method: "mubtkir_ai_creator.api.importer.auto_map",
            args: {
                client_site: this.client_site,
                doctype: this.remote_doctype,
                file_columns: JSON.stringify(this.file_data.headers),
            },
        });
        this.mapping = map_resp.message || {};
    }

    // ─── Step 3: Mapping ───

    render_mapping_step(container) {
        if (!this.meta || !this.file_data) {
            container.html(`<div class="text-muted">${__("جاري تحميل البيانات...")}</div>`);
            this.load_metadata_and_preview().then(() => this.render_mapping_step(container));
            return;
        }

        // Build target field options
        const field_options = [{ value: "", label: __("— تخطي —") }];
        for (const f of this.meta.fields) {
            const reqd = f.reqd ? " *" : "";
            field_options.push({
                value: f.fieldname,
                label: `${f.label || f.fieldname}${reqd} (${f.fieldtype})`,
            });
        }
        // Add child table fields
        for (const [table_fn, table_info] of Object.entries(this.meta.child_tables || {})) {
            for (const cf of table_info.fields) {
                field_options.push({
                    value: `${table_fn}.${cf.fieldname}`,
                    label: `↳ ${table_info.label || table_fn} → ${cf.label || cf.fieldname} (${cf.fieldtype})`,
                });
            }
        }

        const mapping_rows = this.file_data.headers
            .map((h) => {
                const mapped = this.mapping[h] || "";
                const options_html = field_options
                    .map((o) => `<option value="${o.value}" ${o.value === mapped ? "selected" : ""}>${o.label}</option>`)
                    .join("");
                return `<tr>
                    <td style="font-weight:600">${frappe.utils.escape_html(h)}</td>
                    <td class="ri-mapping-arrow">→</td>
                    <td><select class="ri-mapping-select" data-source="${frappe.utils.escape_html(h)}">${options_html}</select></td>
                </tr>`;
            })
            .join("");

        container.html(`
            <div class="ri-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
                    <div class="ri-panel-title" style="margin:0">${__("ربط الأعمدة")}</div>
                    <div style="display:flex; gap:8px">
                        <button class="btn btn-xs btn-default" id="ri-btn-load-mapping">${__("تحميل خريطة")}</button>
                        <button class="btn btn-xs btn-default" id="ri-btn-save-mapping">${__("حفظ الخريطة")}</button>
                    </div>
                </div>
                <table class="ri-mapping-table">
                    <thead>
                        <tr>
                            <th style="width:35%">${__("عمود الملف")}</th>
                            <th style="width:5%"></th>
                            <th style="width:60%">${__("حقل الجدول")}</th>
                        </tr>
                    </thead>
                    <tbody>${mapping_rows}</tbody>
                </table>
                <div id="ri-unmapped-warning" style="margin-top:12px"></div>
            </div>
            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-3">${__("← السابق")}</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-next-3">${__("التالي ←")}</button>
            </div>
        `);

        // Update mapping on change
        container.find(".ri-mapping-select").on("change", (e) => {
            const source = $(e.target).data("source");
            const target = $(e.target).val();
            this.mapping[source] = target || null;
            this.check_unmapped(container);
        });

        // Save mapping
        container.find("#ri-btn-save-mapping").on("click", () => this.save_mapping_dialog());
        container.find("#ri-btn-load-mapping").on("click", () => this.load_mapping_dialog());

        container.find("#ri-btn-prev-3").on("click", () => this.prev_step());
        container.find("#ri-btn-next-3").on("click", () => this.next_step());

        this.check_unmapped(container);
    }

    check_unmapped(container) {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_unmapped_required",
            args: {
                client_site: this.client_site,
                doctype: this.remote_doctype,
                current_mapping: JSON.stringify(this.mapping),
            },
            callback: (r) => {
                const unmapped = r.message || [];
                const warn_div = container.find("#ri-unmapped-warning");
                if (unmapped.length) {
                    const fields = unmapped.map((f) => f.label || f.fieldname).join("، ");
                    warn_div.html(
                        `<div class="text-warning" style="font-size:13px">⚠ ${__("حقول مطلوبة غير مربوطة")}: ${fields}</div>`
                    );
                } else {
                    warn_div.html(
                        `<div class="text-success" style="font-size:13px">✓ ${__("جميع الحقول المطلوبة مربوطة")}</div>`
                    );
                }
            },
        });
    }

    save_mapping_dialog() {
        const d = new frappe.ui.Dialog({
            title: __("حفظ الخريطة"),
            fields: [
                { fieldname: "title", fieldtype: "Data", label: __("اسم الخريطة"), reqd: 1 },
                { fieldname: "is_default", fieldtype: "Check", label: __("خريطة افتراضية") },
                { fieldname: "notes", fieldtype: "Small Text", label: __("ملاحظات") },
            ],
            primary_action_label: __("حفظ"),
            primary_action: (values) => {
                frappe.call({
                    method: "mubtkir_ai_creator.api.importer.save_mapping",
                    args: {
                        mapping_title: values.title,
                        client_site: this.client_site,
                        doctype: this.remote_doctype,
                        mapping_data: JSON.stringify(this.mapping),
                        is_default: values.is_default ? 1 : 0,
                        notes: values.notes || "",
                    },
                    callback: () => {
                        frappe.show_alert({ message: __("تم حفظ الخريطة"), indicator: "green" });
                        d.hide();
                    },
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
                if (!mappings.length) {
                    frappe.msgprint(__("لا توجد خرائط محفوظة لهذا الجدول"));
                    return;
                }

                const d = new frappe.ui.Dialog({
                    title: __("تحميل خريطة"),
                    fields: [
                        {
                            fieldname: "mapping",
                            fieldtype: "Select",
                            label: __("الخريطة"),
                            options: mappings.map((m) => m.mapping_title).join("\n"),
                            reqd: 1,
                        },
                    ],
                    primary_action_label: __("تحميل"),
                    primary_action: (values) => {
                        frappe.call({
                            method: "mubtkir_ai_creator.api.importer.load_mapping",
                            args: { mapping_name: values.mapping },
                            callback: (r2) => {
                                this.mapping = r2.message.mapping_data || {};
                                d.hide();
                                this.render();
                            },
                        });
                    },
                });
                d.show();
            },
        });
    }

    // ─── Step 4: Preview ───

    render_preview_step(container) {
        if (!this.file_data) {
            container.html(`<div class="text-muted">${__("جاري تحميل المعاينة...")}</div>`);
            return;
        }

        const mapped_headers = this.file_data.headers.filter((h) => this.mapping[h]);
        const th = mapped_headers
            .map((h) => `<th>${frappe.utils.escape_html(this.mapping[h])}</th>`)
            .join("");

        const preview_rows = (this.file_data.rows || []).slice(0, 20);
        const rows_html = preview_rows
            .map((row) => {
                const cells = mapped_headers
                    .map((h) => {
                        const idx = this.file_data.headers.indexOf(h);
                        return `<td>${frappe.utils.escape_html(idx < row.length ? row[idx] : "")}</td>`;
                    })
                    .join("");
                return `<tr>${cells}</tr>`;
            })
            .join("");

        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">
                    ${__("معاينة البيانات")}
                    <span style="font-weight:normal; color:var(--text-muted); font-size:12px">
                        (${this.file_data.total_rows} ${__("صف")} — ${__("يُعرض")} ${preview_rows.length})
                    </span>
                </div>
                <div class="ri-preview-wrapper">
                    <table class="ri-preview-table">
                        <thead><tr>${th}</tr></thead>
                        <tbody>${rows_html}</tbody>
                    </table>
                </div>
            </div>

            <div class="ri-panel">
                <div class="ri-panel-title">${__("خيارات الاستيراد")}</div>
                <div id="ri-import-options"></div>
            </div>

            <div class="ri-actions">
                <button class="btn btn-default btn-sm" id="ri-btn-prev-4">${__("← السابق")}</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-start-import">${__("بدء الاستيراد ⚡")}</button>
            </div>
        `);

        // Import options
        this.render_import_options(container.find("#ri-import-options"));

        container.find("#ri-btn-prev-4").on("click", () => this.prev_step());
        container.find("#ri-btn-start-import").on("click", () => this.create_and_start_import());
    }

    render_import_options(container) {
        const options = [
            { key: "submit_after_import", label: __("اعتماد بعد الاستيراد"), default: false },
            { key: "skip_failed_rows", label: __("تخطي الصفوف الفاشلة"), default: true },
            { key: "send_emails", label: __("إرسال إيميلات"), default: false },
            { key: "ignore_empty_values", label: __("تجاهل القيم الفارغة"), default: true },
            { key: "ignore_link_validation", label: __("تجاهل التحقق من الروابط"), default: false },
            { key: "update_child_tables", label: __("تحديث الجداول الفرعية"), default: false },
            { key: "import_attachments", label: __("استيراد المرفقات"), default: false },
            { key: "run_as_background_job", label: __("تنفيذ في الخلفية"), default: true },
        ];

        this.import_options = {};

        const html = options
            .map((o) => {
                this.import_options[o.key] = o.default;
                return `<label class="ri-option-item">
                    <input type="checkbox" data-key="${o.key}" ${o.default ? "checked" : ""}>
                    <span>${o.label}</span>
                </label>`;
            })
            .join("");

        container.html(`<div class="ri-options-grid">${html}</div>
            <div style="margin-top:12px">
                <label style="font-size:13px">${__("حجم الدفعة")}:
                    <input type="number" id="ri-batch-size" value="200" min="10" max="5000" style="width:80px; margin-right:8px" class="input-with-feedback form-control input-xs">
                </label>
            </div>
        `);

        container.find("input[type=checkbox]").on("change", (e) => {
            this.import_options[$(e.target).data("key")] = e.target.checked;
        });
    }

    async create_and_start_import() {
        const batch_size = parseInt($('#ri-batch-size').val()) || 200;

        // Create the AI Remote Import document
        const doc_data = {
            doctype: "AI Remote Import",
            client_site: this.client_site,
            remote_doctype: this.remote_doctype,
            import_type: this.import_type || "Insert",
            source_file: this.file_url,
            source_file_name: this.file_url ? this.file_url.split("/").pop() : "",
            column_mapping: JSON.stringify(this.mapping),
            batch_size: batch_size,
            total_rows: this.file_data.total_rows,
            ...this.import_options,
        };

        try {
            const resp = await frappe.call({
                method: "frappe.client.insert",
                args: { doc: doc_data },
            });
            this.import_doc = resp.message;

            // Start the import
            await frappe.call({
                method: "mubtkir_ai_creator.api.importer.start_import",
                args: { import_name: this.import_doc.name },
            });

            this.next_step();
        } catch (e) {
            frappe.msgprint({
                title: __("خطأ"),
                message: e.message || __("فشل بدء الاستيراد"),
                indicator: "red",
            });
        }
    }

    // ─── Step 5: Progress ───

    render_import_step(container) {
        container.html(`
            <div class="ri-panel">
                <div class="ri-panel-title">${__("تقدم الاستيراد")} — ${this.import_doc?.name || ""}</div>
                <div class="ri-progress-container">
                    <div class="ri-progress-bar-wrapper">
                        <div class="ri-progress-bar" id="ri-pbar" style="width:0%"></div>
                        <div class="ri-progress-text" id="ri-ptext">0%</div>
                    </div>
                </div>
                <div class="ri-progress-stats">
                    <div class="ri-stat success"><div class="ri-stat-value" id="ri-stat-imported">0</div><div class="ri-stat-label">${__("تم استيرادها")}</div></div>
                    <div class="ri-stat error"><div class="ri-stat-value" id="ri-stat-failed">0</div><div class="ri-stat-label">${__("فشلت")}</div></div>
                    <div class="ri-stat warning"><div class="ri-stat-value" id="ri-stat-skipped">0</div><div class="ri-stat-label">${__("تم تخطيها")}</div></div>
                    <div class="ri-stat"><div class="ri-stat-value" id="ri-stat-total">${this.file_data?.total_rows || 0}</div><div class="ri-stat-label">${__("الإجمالي")}</div></div>
                    <div class="ri-stat"><div class="ri-stat-value" id="ri-stat-batch">0/0</div><div class="ri-stat-label">${__("الدفعة")}</div></div>
                </div>
                <div id="ri-import-status" style="margin-top:16px; text-align:center"></div>
            </div>
            <div id="ri-error-panel"></div>
            <div class="ri-actions">
                <button class="btn btn-danger btn-sm" id="ri-btn-cancel-import">${__("إلغاء")}</button>
                <button class="btn btn-default btn-sm" id="ri-btn-new-import" style="display:none">${__("استيراد جديد")}</button>
                <button class="btn btn-warning btn-sm" id="ri-btn-retry" style="display:none">${__("إعادة المحاولة")}</button>
                <button class="btn btn-primary btn-sm" id="ri-btn-resume" style="display:none">${__("استئناف")}</button>
            </div>
        `);

        container.find("#ri-btn-cancel-import").on("click", () => this.cancel_import());
        container.find("#ri-btn-new-import").on("click", () => {
            this.current_step = 0;
            this.import_doc = null;
            this.render();
        });
        container.find("#ri-btn-retry").on("click", () => this.retry_import());
        container.find("#ri-btn-resume").on("click", () => this.resume_import());

        this.start_progress_polling();
    }

    start_progress_polling() {
        if (!this.import_doc) return;

        // Realtime events
        frappe.realtime.on("import_progress", (data) => {
            if (data.import_name !== this.import_doc.name) return;
            this.update_progress_ui(data);
        });

        frappe.realtime.on("import_complete", (data) => {
            if (data.import_name !== this.import_doc.name) return;
            this.on_import_complete(data);
        });

        // Fallback polling
        this._poll_timer = setInterval(() => {
            frappe.call({
                method: "mubtkir_ai_creator.api.importer.get_import_status",
                args: { import_name: this.import_doc.name },
                callback: (r) => {
                    const data = r.message;
                    this.update_progress_ui(data);
                    if (["Success", "Failed", "Partial Success", "Cancelled"].includes(data.status)) {
                        this.on_import_complete(data);
                    }
                },
            });
        }, 3000);
    }

    update_progress_ui(data) {
        const pct = data.progress_percent || 0;
        $("#ri-pbar").css("width", pct + "%");
        $("#ri-ptext").text(Math.round(pct) + "%");
        $("#ri-stat-imported").text(data.imported_rows || data.imported || 0);
        $("#ri-stat-failed").text(data.failed_rows || data.failed || 0);
        $("#ri-stat-skipped").text(data.skipped_rows || data.skipped || 0);
        if (data.current_batch !== undefined) {
            $("#ri-stat-batch").text(`${data.current_batch}/${data.total_batches || "?"}`);
        }
    }

    on_import_complete(data) {
        if (this._poll_timer) {
            clearInterval(this._poll_timer);
            this._poll_timer = null;
        }

        const status = data.status;
        let icon = "✓";
        let color = "green";

        if (status === "Failed") {
            icon = "✗";
            color = "red";
        } else if (status === "Partial Success") {
            icon = "⚠";
            color = "orange";
        } else if (status === "Cancelled") {
            icon = "⊘";
            color = "grey";
        }

        $("#ri-import-status").html(
            `<div style="font-size:18px; font-weight:700; color:var(--${color}-600)">${icon} ${status}</div>`
        );
        $("#ri-pbar").css("width", "100%");

        // Show/hide buttons
        $("#ri-btn-cancel-import").hide();
        $("#ri-btn-new-import").show();

        if (status === "Failed" || status === "Partial Success") {
            $("#ri-btn-retry").show();
            if (data.is_resumable) {
                $("#ri-btn-resume").show();
            }
            this.load_errors();
        }
    }

    load_errors() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.get_import_status",
            args: { import_name: this.import_doc.name },
            callback: (r) => {
                // Load the full doc for error_log
                frappe.call({
                    method: "frappe.client.get",
                    args: { doctype: "AI Remote Import", name: this.import_doc.name },
                    callback: (r2) => {
                        const error_log = r2.message.error_log;
                        if (!error_log) return;

                        try {
                            const errors = JSON.parse(error_log);
                            if (!errors.length) return;

                            const items = errors
                                .slice(0, 50)
                                .map(
                                    (e) =>
                                        `<div class="ri-error-item">
                                            <span class="ri-error-row-num">${__("صف")} ${e.row}</span>
                                            <span>${frappe.utils.escape_html(e.error)}</span>
                                        </div>`
                                )
                                .join("");

                            $("#ri-error-panel").html(`
                                <div class="ri-panel">
                                    <div class="ri-panel-title">${__("تفاصيل الأخطاء")} (${errors.length})</div>
                                    <div class="ri-error-list">${items}</div>
                                </div>
                            `);
                        } catch (e) {
                            // ignore JSON parse errors
                        }
                    },
                });
            },
        });
    }

    cancel_import() {
        frappe.confirm(__("هل تريد إلغاء الاستيراد؟"), () => {
            frappe.call({
                method: "mubtkir_ai_creator.api.importer.cancel_import",
                args: { import_name: this.import_doc.name },
                callback: () => {
                    this.on_import_complete({ status: "Cancelled" });
                },
            });
        });
    }

    resume_import() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.resume_import",
            args: { import_name: this.import_doc.name },
            callback: (r) => {
                frappe.show_alert({ message: __("تم استئناف الاستيراد"), indicator: "blue" });
                this.render_import_step(this.wrapper.find(".ri-step-content"));
            },
        });
    }

    retry_import() {
        frappe.call({
            method: "mubtkir_ai_creator.api.importer.retry_failed_rows",
            args: { import_name: this.import_doc.name },
            callback: (r) => {
                const data = r.message;
                if (data.retry_import) {
                    this.import_doc = { name: data.retry_import };
                    frappe.show_alert({
                        message: __("تم إنشاء استيراد جديد للصفوف الفاشلة"),
                        indicator: "blue",
                    });
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
                const data = r.message;
                this.wrapper.html("");

                const cards = `
                    <div class="ri-dashboard-grid">
                        <div class="ri-dashboard-card">
                            <div class="value">${data.total_imports}</div>
                            <div class="label">${__("إجمالي الاستيرادات")}</div>
                        </div>
                        <div class="ri-dashboard-card">
                            <div class="value" style="color:var(--green-600)">${data.successful}</div>
                            <div class="label">${__("ناجحة")}</div>
                        </div>
                        <div class="ri-dashboard-card">
                            <div class="value" style="color:var(--red-600)">${data.failed}</div>
                            <div class="label">${__("فاشلة")}</div>
                        </div>
                        <div class="ri-dashboard-card">
                            <div class="value">${data.avg_speed}</div>
                            <div class="label">${__("متوسط السرعة (صف/ث)")}</div>
                        </div>
                    </div>
                `;

                const top_dt = (data.top_doctypes || [])
                    .map(
                        (d) =>
                            `<tr><td>${d.remote_doctype}</td><td>${d.cnt}</td><td>${d.total_imported}</td></tr>`
                    )
                    .join("");

                const top_cl = (data.top_clients || [])
                    .map(
                        (d) =>
                            `<tr><td>${d.client_site}</td><td>${d.cnt}</td><td>${d.total_imported}</td></tr>`
                    )
                    .join("");

                this.wrapper.html(`
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                        <h3>${__("Dashboard — Remote Import")}</h3>
                        <button class="btn btn-primary btn-sm" id="ri-btn-back-wizard">${__("← استيراد جديد")}</button>
                    </div>
                    ${cards}
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px">
                        <div class="ri-panel">
                            <div class="ri-panel-title">${__("أكثر الجداول استيرادًا")}</div>
                            <table class="ri-preview-table" style="white-space:normal">
                                <thead><tr><th>DocType</th><th>${__("عدد")}</th><th>${__("صفوف")}</th></tr></thead>
                                <tbody>${top_dt || `<tr><td colspan="3" class="text-muted">${__("لا توجد بيانات")}</td></tr>`}</tbody>
                            </table>
                        </div>
                        <div class="ri-panel">
                            <div class="ri-panel-title">${__("أكثر العملاء نشاطًا")}</div>
                            <table class="ri-preview-table" style="white-space:normal">
                                <thead><tr><th>${__("العميل")}</th><th>${__("عدد")}</th><th>${__("صفوف")}</th></tr></thead>
                                <tbody>${top_cl || `<tr><td colspan="3" class="text-muted">${__("لا توجد بيانات")}</td></tr>`}</tbody>
                            </table>
                        </div>
                    </div>
                `);

                this.wrapper.find("#ri-btn-back-wizard").on("click", () => {
                    this.current_step = 0;
                    this.render();
                });
            },
        });
    }
}
