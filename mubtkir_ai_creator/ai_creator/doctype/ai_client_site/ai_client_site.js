frappe.ui.form.on('AI Client Site', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__('فحص الاتصال'), function () {
			frm.dashboard.clear_headline();
			frappe.dom.freeze(__('جارٍ فحص الاتصال...'));

			frappe.call({
				method: 'mubtkir_ai_creator.ai_creator.doctype.ai_client_site.ai_client_site.test_connection',
				args: { name: frm.doc.name },
				callback: function (r) {
					frappe.dom.unfreeze();
					const res = r.message || {};

					if (res.status === 'Connected') {
						frappe.show_alert(
							{ message: __('تم الاتصال بنجاح — المستخدم: {0}', [res.user || '']), indicator: 'green' },
							7
						);
					} else {
						frappe.msgprint({
							title: __('فشل الاتصال'),
							indicator: 'red',
							message: `<pre style="white-space:pre-wrap;direction:ltr;text-align:left;">${frappe.utils.escape_html(
								res.error || 'خطأ غير معروف'
							)}</pre>`,
						});
					}
					frm.reload_doc();
				},
				error: function () {
					frappe.dom.unfreeze();
				},
			});
		}).addClass('btn-primary');

		// شريط حالة أعلى النموذج
		const map = {
			Connected: ['green', 'متصل'],
			Failed: ['red', 'فشل الاتصال'],
			Unknown: ['orange', 'لم يتم الفحص بعد'],
		};
		const s = map[frm.doc.status] || map.Unknown;
		frm.dashboard.set_headline_alert(
			`<span class="indicator ${s[0]}">${s[1]}${
				frm.doc.last_connection_check ? ' — آخر فحص: ' + frappe.datetime.str_to_user(frm.doc.last_connection_check) : ''
			}</span>`
		);
	},
});

// أزرار الالتقاط داخل نموذج العميل
frappe.ui.form.on('AI Client Site', {
	onload_post_render: function (frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__('التقاط تخصيص'), function () {
			const d = new frappe.ui.Dialog({
				title: __('التقاط تخصيص من هذا العميل'),
				fields: [
					{
						fieldname: 'artifact_type',
						label: __('النوع'),
						fieldtype: 'Select',
						options: 'Custom Field\nProperty Setter\nPrint Format\nClient Script\nServer Script\nCustom HTML Block\nWorkspace\nItem\nCustomer\nSupplier',
						reqd: 1,
						default: 'Print Format',
					},
					{ fieldname: 'target_doctype', label: __('حصر بـ DocType (اختياري)'), fieldtype: 'Data' },
					{ fieldname: 'load', label: __('استعراض المتاح'), fieldtype: 'Button' },
					{ fieldname: 'results', fieldtype: 'HTML' },
				],
			});

			d.fields_dict.load.$input.on('click', function () {
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_list_available',
					args: {
						client_site: frm.doc.name,
						artifact_type: d.get_value('artifact_type'),
						target_doctype: d.get_value('target_doctype') || null,
					},
					freeze: true,
					callback: function (r) {
						const rows = r.message || [];
						if (!rows.length) {
							d.fields_dict.results.$wrapper.html('<div dir="rtl">لا توجد عناصر من هذا النوع</div>');
							return;
						}
						const $list = $('<div dir="rtl" style="max-height:300px;overflow:auto;"></div>');
						rows.forEach((row) => {
							const $item = $(`
								<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);">
									<span>${frappe.utils.escape_html(row.name)}</span>
									<button class="btn btn-xs btn-default">التقاط</button>
								</div>
							`);
							$item.find('button').on('click', function () {
								frappe.call({
									method: 'mubtkir_ai_creator.lib.templates.run_capture',
									args: {
										client_site: frm.doc.name,
										artifact_type: d.get_value('artifact_type'),
										source_name: row.name,
									},
									freeze: true,
									callback: function (res) {
										const m = res.message || {};
										frappe.show_alert(
											{ message: __('تم الالتقاط — النسخة {0}', [m.version]), indicator: 'green' },
											5
										);
									},
								});
							});
							$list.append($item);
						});
						d.fields_dict.results.$wrapper.empty().append($list);
					},
				});
			});

			d.show();
		});
	},
});


// Capture All button
frappe.ui.form.on('AI Client Site', {
    refresh: function(frm) {
        if (frm.is_new()) return;
        frm.add_custom_button(__('Capture All Customizations'), function() {
            frappe.confirm(
                'Capture all Custom Fields, Property Setters, Print Formats, Client Scripts, Server Scripts, Custom HTML Blocks, and Workspaces from this client?',
                function() {
                    frappe.call({
                        method: 'mubtkir_ai_creator.lib.templates.run_capture_all',
                        args: { client_site: frm.doc.name },
                        freeze: true,
                        freeze_message: __('Capturing...'),
                        callback: function(r) {
                            const m = r.message || {};
                            frappe.msgprint({
                                title: __('Capture Complete'),
                                indicator: 'green',
                                message: `Captured: ${m.captured || 0} items. Errors: ${(m.errors || []).length}`,
                            });
                        },
                    });
                }
            );
        }, __('Templates'));
    },
});
