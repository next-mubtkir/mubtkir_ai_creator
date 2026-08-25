frappe.listview_settings['AI Template'] = {
	get_indicator: function(doc) {
		if (doc.deployable) return [__('Deployable'), 'green', 'deployable,=,1'];
		return [__('View only'), 'grey', 'deployable,=,0'];
	},
};
