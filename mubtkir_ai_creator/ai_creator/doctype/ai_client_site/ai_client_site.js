frappe.ui.form.on('AI Client Site', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		// ===== 1. Test Connection =====
		frm.add_custom_button(__('Test Connection'), function () {
			frm.dashboard.clear_headline();
			frappe.dom.freeze(__('جارٍ Test Connection...'));
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
								: 'failed — ' + (m.error || '')
						}</span>`
					);
				},
				error: function () {
					frappe.dom.unfreeze();
				},
			});
		});

		// ===== 2. Capture Customization واحد =====
		frm.add_custom_button(__('Capture Customization'), function () {
			const d = new frappe.ui.Dialog({
				title: __('Capture Customization from this Client'),
				fields: [
					{
						fieldname: 'artifact_type',
						label: __('Type'),
						fieldtype: 'Select',
						options: 'Custom Field\nProperty Setter\nPrint Format\nClient Script\nServer Script\nCustom HTML Block\nWorkspace\nItem\nCustomer\nSupplier',
						reqd: 1,
						default: 'Print Format',
					},
					{ fieldname: 'target_doctype', label: __('Filter by DocType (optional)'), fieldtype: 'Data' },
					{ fieldname: 'load', label: __('Browse Available'), fieldtype: 'Button' },
					{ fieldname: 'select_all', label: __('Select All'), fieldtype: 'Button', hidden: 1 },
					{ fieldname: 'results', fieldtype: 'HTML' },
				],
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
					d.fields_dict.results.$wrapper.html('<div dir="rtl">لا توجد عناصر من هذا Type</div>');
					d.set_df_property('select_all', 'hidden', 1);
					return;
				}
				d.set_df_property('select_all', 'hidden', 0);
				const $list = $('<div dir="rtl" style="max-height:300px;overflow:auto;"></div>');
				rows.forEach((row) => {
					const $item = $(`
						<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);">
							<span>${frappe.utils.escape_html(row.name)}</span>
							<button class="btn btn-xs btn-default">Capture</button>
						</div>
					`);
					$item.find('button').on('click', function () {
						const $btn = $(this);
						$btn.prop('disabled', true);
						captureOne(row, function (err, m) {
							if (err) { $btn.prop('disabled', false); return; }
							$btn.replaceWith('<span class="text-muted">Done — version ' + (m.version || '') + '</span>');
						});
					});
					$list.append($item);
				});
				d.fields_dict.results.$wrapper.empty().append($list);
			}

			// Show dialog FIRST, then bind events (Button $input only exists after render)
			d.show();

			// Bind load button
			d.fields_dict.load.$input.off('click').on('click', function () {
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

			// Bind select all button
			d.fields_dict.select_all.$input.off('click').on('click', function () {
				if (!lastRows.length) return;
				frappe.confirm(
					__('Capture all displayed items ({0}) as templates?', [lastRows.length]),
					function () {
						let done = 0, failed = 0;
						frappe.dom.freeze(__('Capturing...'));
						const next = (i) => {
							if (i >= lastRows.length) {
								frappe.dom.unfreeze();
								frappe.show_alert({ message: __('Done — succeeded {0}، failed {1}', [done, failed]), indicator: failed ? 'orange' : 'green' }, 6);
								return;
							}
							captureOne(lastRows[i], function (err) { if (err) failed++; else done++; next(i + 1); });
						};
						next(0);
					}
				);
			});

		}, __('Templates'));

	},
});
