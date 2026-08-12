frappe.listview_settings['AI Template'] = {
	onload: function(listview) {
		listview.page.add_inner_button(__('Export to Excel'), function() {
			frappe.call({
				method: 'mubtkir_ai_creator.lib.exporter.run_export',
				args: { format: 'excel' },
				freeze: true,
				freeze_message: __('Generating Excel...'),
				callback: function(r) {
					const m = r.message || {};
					if (m.file_url) {
						window.open(m.file_url);
						frappe.show_alert({ message: __('Excel exported — {0} templates', [m.template_count]), indicator: 'green' }, 5);
					}
				},
			});
		});

		listview.page.add_inner_button(__('Export to PDF'), function() {
			frappe.call({
				method: 'mubtkir_ai_creator.lib.exporter.run_export',
				args: { format: 'pdf' },
				freeze: true,
				freeze_message: __('Generating PDF...'),
				callback: function(r) {
					const m = r.message || {};
					if (m.file_url) {
						window.open(m.file_url);
						frappe.show_alert({ message: __('PDF exported — {0} templates', [m.template_count]), indicator: 'green' }, 5);
					}
				},
			});
		});
	},

	get_indicator: function(doc) {
		if (doc.deployable) return [__('Deployable'), 'green', 'deployable,=,1'];
		return [__('View only'), 'grey', 'deployable,=,0'];
	},
};
