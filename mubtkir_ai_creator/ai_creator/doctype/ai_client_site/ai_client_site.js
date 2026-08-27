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

		// ===== 2. Capture Customization =====
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
					{ fieldname: 'results', fieldtype: 'HTML' },
				],
				primary_action_label: __('Capture Selected'),
				primary_action: function () {
					const checked = getCheckedRows();
					if (!checked.length) {
						frappe.show_alert({ message: __('اختر عنصر واحد على الأقل'), indicator: 'orange' });
						return;
					}
					frappe.dom.freeze(__('جارٍ الالتقاط...'));
					frappe.call({
						method: 'mubtkir_ai_creator.lib.templates.run_capture_batch',
						args: {
							client_site: frm.doc.name,
							artifact_type: d.get_value('artifact_type'),
							source_names: checked.map(r => r.name),
						},
						callback: function (res) {
							frappe.dom.unfreeze();
							const m = res.message || {};
							frappe.show_alert({
								message: __('تم إنشاء قالب «{0}» — يحتوي {1} عنصر (النسخة {2})', [m.template, m.count, m.version]),
								indicator: 'green',
							}, 8);
							d.hide();
						},
						error: function () {
							frappe.dom.unfreeze();
						},
					});
				},
			});

			let lastRows = [];

			function getCheckedRows() {
				const names = [];
				d.$wrapper.find('.capture-check:checked').each(function () {
					const n = $(this).data('name');
					const row = lastRows.find(r => r.name === n);
					if (row) names.push(row);
				});
				return names;
			}

			function updateCounter() {
				const total = d.$wrapper.find('.capture-check').length;
				const checked = d.$wrapper.find('.capture-check:checked').length;
				d.$wrapper.find('.capture-counter').text(
					checked ? __('محدد {0} من {1}', [checked, total]) : ''
				);
				// Enable/disable primary button
				d.set_primary_action_enabled(checked > 0);
			}

			function renderResults(rows) {
				lastRows = rows;
				const $wrapper = d.fields_dict.results.$wrapper;

				if (!rows.length) {
					$wrapper.html('<div class="text-muted text-center p-4">لا توجد عناصر من هذا النوع</div>');
					d.set_primary_action_enabled(false);
					return;
				}

				const $container = $(`
					<div>
						<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:2px solid var(--border-color);">
							<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:600;">
								<input type="checkbox" class="select-all-check">
								${__('تحديد الكل')} (<span class="items-count">${rows.length}</span>)
							</label>
							<span class="capture-counter text-muted" style="margin-right:auto;font-size:12px;"></span>
						</div>
						<div class="capture-list" style="max-height:300px;overflow:auto;"></div>
					</div>
				`);

				const $list = $container.find('.capture-list');

				rows.forEach((row) => {
					const displayName = frappe.utils.escape_html(row.name);
					const extraInfo = row.dt || row.doc_type || row.reference_doctype || '';
					const $item = $(`
						<label style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-color);cursor:pointer;margin:0;">
							<input type="checkbox" class="capture-check" data-name="${frappe.utils.escape_html(row.name)}">
							<span style="flex:1;">${displayName}</span>
							${extraInfo ? '<span class="text-muted" style="font-size:12px;">' + frappe.utils.escape_html(extraInfo) + '</span>' : ''}
						</label>
					`);
					$list.append($item);
				});

				// Select All toggle
				$container.find('.select-all-check').on('change', function () {
					const isChecked = $(this).prop('checked');
					$list.find('.capture-check').prop('checked', isChecked);
					updateCounter();
				});

				// Individual checkbox change
				$container.on('change', '.capture-check', function () {
					const total = $list.find('.capture-check').length;
					const checked = $list.find('.capture-check:checked').length;
					$container.find('.select-all-check').prop('checked', checked === total);
					updateCounter();
				});

				$wrapper.empty().append($container);
				d.set_primary_action_enabled(false);
			}

			d.set_primary_action_enabled(false);
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

		}, __('Templates'));

	},
});
