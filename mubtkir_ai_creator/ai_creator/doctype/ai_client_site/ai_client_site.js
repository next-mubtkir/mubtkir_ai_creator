frappe.ui.form.on('AI Client Site', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		// ===== 1. فحص الاتصال =====
		frm.add_custom_button(__('فحص الاتصال'), function () {
			frm.dashboard.clear_headline();
			frappe.dom.freeze(__('جارٍ فحص الاتصال...'));
			frappe.call({
				method: 'mubtkir_ai_creator.ai_creator.doctype.ai_client_site.ai_client_site.test_connection',
				args: { name: frm.doc.name },
				callback: function (r) {
					frappe.dom.unfreeze();
					frm.reload_doc();
					const m = r.message || {};
					frm.dashboard.set_headline_alert(
						`<span class="indicator ${m.ok ? 'green' : 'red'}">${
							m.ok
								? 'متصل — Frappe ' + (m.frappe_version || '') + ' / ERPNext ' + (m.erpnext_version || '')
								: 'فشل — ' + (m.error || '')
						}</span>`
					);
				},
				error: function () {
					frappe.dom.unfreeze();
				},
			});
		});

		// ===== 2. التقاط تخصيص واحد =====
		frm.add_custom_button(__('التقاط تخصيص'), function () {
			const d = new frappe.ui.Dialog({
				title: __('التقاط تخصيص من هذا العميل'),
				fields: [
					{
						fieldname: 'artifact_type',
						label: __('النوع'),
						fieldtype: 'Autocomplete',
						reqd: 1,
						default: 'Print Format',
					},
					{ fieldname: 'target_doctype', label: __('حصر بـ DocType (اختياري)'), fieldtype: 'Data' },
					{ fieldname: 'load', label: __('استعراض المتاح'), fieldtype: 'Button' },
					{ fieldname: 'select_all', label: __('تحديد الكل'), fieldtype: 'Button', hidden: 1 },
					{ fieldname: 'results', fieldtype: 'HTML' },
				],
			});

			frappe.call({
				method: 'mubtkir_ai_creator.lib.templates.run_list_artifact_types',
				args: { client_site: frm.doc.name },
				callback: function (r) {
					d.fields_dict.artifact_type.df.options = r.message || [];
					d.fields_dict.artifact_type.refresh();
				},
			});

			let lastRows = [];

			function captureOne(row, onDone) {
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_capture',
					args: {
						client_site: frm.doc.name,
						artifact_type: d.get_value('artifact_type'),
						source_name: row.name,
					},
					callback: function (res) { onDone(null, res.message); },
					error: function (err) { onDone(err, null); },
				});
			}

			function renderResults(rows) {
				lastRows = rows;
				if (!rows.length) {
					d.fields_dict.results.$wrapper.html('<div dir="rtl">لا توجد عناصر من هذا النوع</div>');
					d.set_df_property('select_all', 'hidden', 1);
					return;
				}
				d.set_df_property('select_all', 'hidden', 0);
				const $list = $('<div dir="rtl" style="max-height:300px;overflow:auto;"></div>');
				rows.forEach((row) => {
					const $item = $(`
						<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);">
							<span>${frappe.utils.escape_html(row.name)}</span>
							<button class="btn btn-xs btn-default">التقاط</button>
						</div>
					`);
					$item.find('button').on('click', function () {
						const $btn = $(this);
						$btn.prop('disabled', true);
						captureOne(row, function (err, m) {
							if (err) { $btn.prop('disabled', false); return; }
							$btn.replaceWith('<span class="text-muted">تم — النسخة ' + (m.version || '') + '</span>');
						});
					});
					$list.append($item);
				});
				d.fields_dict.results.$wrapper.empty().append($list);
			}

			d.fields_dict.load.$input.on('click', function () {
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_list_available',
					args: {
						client_site: frm.doc.name,
						artifact_type: d.get_value('artifact_type'),
						target_doctype: d.get_value('target_doctype') || null,
					},
					freeze: true,
					callback: function (r) { renderResults(r.message || []); },
				});
			});

			d.fields_dict.select_all.$input.on('click', function () {
				if (!lastRows.length) return;
				frappe.confirm(
					__('التقاط كل العناصر المعروضة ({0}) كقوالب؟', [lastRows.length]),
					function () {
						let done = 0, failed = 0;
						frappe.dom.freeze(__('جارٍ الالتقاط...'));
						const next = (i) => {
							if (i >= lastRows.length) {
								frappe.dom.unfreeze();
								frappe.show_alert({ message: __('اكتمل — نجح {0}، فشل {1}', [done, failed]), indicator: failed ? 'orange' : 'green' }, 6);
								return;
							}
							captureOne(lastRows[i], function (err) { if (err) failed++; else done++; next(i + 1); });
						};
						next(0);
					}
				);
			});

			d.show();
		}, __('Templates'));

		// ===== 3. التقاط الكل =====
		frm.add_custom_button(__('Capture All Customizations'), function () {
			frappe.confirm(
				'Capture all Custom Fields, Property Setters, Print Formats, Client Scripts, Server Scripts, Custom HTML Blocks, and Workspaces from this client?',
				function () {
					frappe.call({
						method: 'mubtkir_ai_creator.lib.templates.run_capture_all',
						args: { client_site: frm.doc.name },
						freeze: true,
						freeze_message: __('Capturing...'),
						callback: function (r) {
							const m = r.message || {};
							frappe.msgprint({
								title: __('Capture Complete'),
								indicator: 'green',
								message: 'Captured: ' + (m.captured || 0) + ' items. Errors: ' + ((m.errors || []).length),
							});
						},
					});
				}
			);
		}, __('Templates'));
	},
});
