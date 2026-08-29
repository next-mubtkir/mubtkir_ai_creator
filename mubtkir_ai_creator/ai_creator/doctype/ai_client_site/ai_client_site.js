frappe.ui.form.on('AI Client Site', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		// ===== 1. Test Connection =====
		frm.add_custom_button(__('Test Connection'), function () {
			frm.dashboard.clear_headline();
			frappe.dom.freeze(__('Testing connection...'));
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
								? 'Connected — Frappe ' + (m.frappe_version || '') + ' / ERPNext ' + (m.erpnext_version || '')
								: 'Failed — ' + (m.error || '')
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
			let lastRows = [];

			const d = new frappe.ui.Dialog({
				title: __('Capture Customization from this Client'),
				size: 'large',
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
					const checked = [];
					d.$wrapper.find('.capture-check:checked').each(function () {
						const name = $(this).data('name');
						if (name) checked.push(name);
					});

					if (!checked.length) {
						frappe.show_alert({ message: __('Select at least one item'), indicator: 'orange' });
						return;
					}

					frappe.dom.freeze(__('Capturing...'));
					frappe.call({
						method: 'mubtkir_ai_creator.lib.templates.run_capture_batch',
						args: {
							client_site: frm.doc.name,
							artifact_type: d.get_value('artifact_type'),
							source_names: JSON.stringify(checked),
						},
						callback: function (res) {
							frappe.dom.unfreeze();
							const m = res.message || {};
							frappe.show_alert({
								message: __('Template "{0}" created — {1} item(s), version {2}', [m.template, m.count, m.version]),
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

			function renderResults(rows) {
				lastRows = rows;
				const $wrapper = d.fields_dict.results.$wrapper;

				if (!rows.length) {
					$wrapper.html('<div class="text-muted text-center" style="padding:20px;">No items found for this type</div>');
					d.get_primary_btn().prop('disabled', true);
					return;
				}

				const $container = $('<div></div>');

				// ===== Select All row =====
				const $toolbar = $(`
					<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:2px solid var(--border-color);margin-bottom:4px;">
						<input type="checkbox" class="select-all-check" style="width:16px;height:16px;cursor:pointer;">
						<b>${__('Select All')} (${rows.length})</b>
						<span class="capture-counter text-muted" style="margin-right:auto;font-size:12px;"></span>
					</div>
				`);
				$container.append($toolbar);

				// ===== Items list =====
				const $list = $('<div style="max-height:300px;overflow-y:auto;"></div>');
				rows.forEach(function (row) {
					const safeName = frappe.utils.escape_html(row.name);
					const extra = row.dt || row.doc_type || row.reference_doctype || '';
					const $item = $(`
						<label style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border-color);cursor:pointer;margin:0;">
							<input type="checkbox" class="capture-check" data-name="${safeName}" style="width:15px;height:15px;cursor:pointer;">
							<span style="flex:1;">${safeName}</span>
							${extra ? '<span class="text-muted" style="font-size:11px;">' + frappe.utils.escape_html(extra) + '</span>' : ''}
						</label>
					`);
					$list.append($item);
				});
				$container.append($list);

				// ===== Select All toggle =====
				$container.find('.select-all-check').on('change', function () {
					const isChecked = $(this).prop('checked');
					$list.find('.capture-check').prop('checked', isChecked);
					updateCounter();
				});

				// ===== Individual checkbox =====
				$container.on('change', '.capture-check', function () {
					const total = $list.find('.capture-check').length;
					const checked = $list.find('.capture-check:checked').length;
					$container.find('.select-all-check').prop('checked', checked === total);
					updateCounter();
				});

				function updateCounter() {
					const total = $list.find('.capture-check').length;
					const checked = $list.find('.capture-check:checked').length;
					$container.find('.capture-counter').text(
						checked ? __('Selected {0} of {1}', [checked, total]) : ''
					);
					d.get_primary_btn().prop('disabled', checked === 0);
				}

				$wrapper.empty().append($container);
				d.get_primary_btn().prop('disabled', true);
			}

			d.show();
			d.get_primary_btn().prop('disabled', true);

			// ===== Browse Available button =====
			d.fields_dict.load.$input.off('click').on('click', function () {
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_list_available',
					args: {
						client_site: frm.doc.name,
						artifact_type: d.get_value('artifact_type'),
						target_doctype: d.get_value('target_doctype') || null,
					},
					freeze: true,
					callback: function (r) {
						renderResults(r.message || []);
					},
				});
			});

		}, __('Templates'));

	},
});
