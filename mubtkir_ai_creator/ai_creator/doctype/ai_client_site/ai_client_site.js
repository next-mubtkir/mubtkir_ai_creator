frappe.ui.form.on('AI Client Site', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		// ===== 1. Test Connection =====
		frm.add_custom_button('Test Connection', function () {
			frm.dashboard.clear_headline();
			frappe.dom.freeze('Testing connection...');
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
				error: function () { frappe.dom.unfreeze(); },
			});
		});

		// ===== 2. Capture Customization (batch → ONE template) =====
		frm.add_custom_button('Capture Customization', function () {
			const d = new frappe.ui.Dialog({
				title: 'Capture Customization from this Client',
				fields: [
					{ fieldname: 'artifact_type', label: 'Type', fieldtype: 'Select',
					  options: 'Custom Field\nProperty Setter\nPrint Format\nClient Script\nServer Script\nCustom HTML Block\nWorkspace\nItem\nCustomer\nSupplier',
					  reqd: 1, default: 'Print Format' },
					{ fieldname: 'target_doctype', label: 'Filter by DocType (optional)', fieldtype: 'Data' },
					{ fieldname: 'load', label: 'Browse Available', fieldtype: 'Button' },
					{ fieldname: 'capture_selected', label: 'Capture Selected', fieldtype: 'Button', hidden: 1 },
					{ fieldname: 'results', fieldtype: 'HTML' },
				],
			});

			let selectedNames = new Set();

			function renderResults(rows) {
				selectedNames.clear();
				const $w = d.fields_dict.results.$wrapper;
				if (!rows.length) {
					$w.html('<div class="text-muted" style="padding:12px">No items found</div>');
					d.set_df_property('capture_selected', 'hidden', 1);
					return;
				}
				d.set_df_property('capture_selected', 'hidden', 0);
				const $list = $('<div style="max-height:350px;overflow:auto"></div>');

				// Select All header
				const $hdr = $('<div style="display:flex;align-items:center;padding:8px 0;border-bottom:2px solid var(--border-color);font-weight:600"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1"><input type="checkbox" class="ri-sa"> Select All (' + rows.length + ')</label></div>');
				$hdr.find('.ri-sa').on('change', function() {
					const c = this.checked;
					$list.find('.ri-ic').prop('checked', c);
					if (c) rows.forEach(r => selectedNames.add(r.name));
					else selectedNames.clear();
					_upd();
				});
				$list.append($hdr);

				rows.forEach(row => {
					const $item = $('<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color)"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1"><input type="checkbox" class="ri-ic"><span>' + frappe.utils.escape_html(row.name) + '</span></label></div>');
					$item.find('.ri-ic').on('change', function() {
						if (this.checked) selectedNames.add(row.name);
						else selectedNames.delete(row.name);
						_upd();
					});
					$list.append($item);
				});
				$w.empty().append($list);
			}

			function _upd() {
				d.set_df_property('capture_selected', 'label', selectedNames.size ? 'Capture Selected (' + selectedNames.size + ')' : 'Capture Selected');
			}

			d.show();

			d.fields_dict.load.$input.off('click').on('click', function () {
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_list_available',
					args: { client_site: frm.doc.name, artifact_type: d.get_value('artifact_type'), target_doctype: d.get_value('target_doctype') || null },
					freeze: true,
					callback: function (r) { renderResults(r.message || []); },
				});
			});

			d.fields_dict.capture_selected.$input.off('click').on('click', function () {
				const names = Array.from(selectedNames);
				if (!names.length) { frappe.msgprint('Select at least one item'); return; }
				frappe.confirm('Capture ' + names.length + ' item(s) into one template?', function () {
					frappe.dom.freeze('Capturing...');
					frappe.call({
						method: 'mubtkir_ai_creator.lib.templates.run_capture_batch',
						args: { client_site: frm.doc.name, artifact_type: d.get_value('artifact_type'), source_names: JSON.stringify(names) },
						callback: function (r) {
							frappe.dom.unfreeze();
							const m = r.message || {};
							frappe.show_alert({ message: 'Captured ' + (m.count || names.length) + ' items → ' + (m.template || ''), indicator: 'green' }, 6);
							d.hide();
						},
						error: function () { frappe.dom.unfreeze(); },
					});
				});
			});
		}, 'Templates');
	},
});
