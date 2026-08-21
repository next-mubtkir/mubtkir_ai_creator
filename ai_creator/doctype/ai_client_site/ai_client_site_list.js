frappe.listview_settings['AI Client Site'] = {
	add_fields: ['status', 'credentials_ready', 'is_active'],

	get_indicator: function (doc) {
		if (!doc.credentials_ready) return [__('Awaiting Credentials'), 'orange', 'credentials_ready,=,0'];
		if (doc.status === 'Connected') return [__('Connected'), 'green', 'status,=,Connected'];
		if (doc.status === 'Failed') return [__('Connection Failed'), 'red', 'status,=,Failed'];
		return [__('لم يُفحص'), 'grey', 'status,=,Unknown'];
	},

	onload: function (listview) {
		frappe.call({
			method: 'mubtkir_ai_creator.lib.press_sync.press_status',
			callback: function (r) {
				if (!(r.message || {}).available) return;

				listview.page.add_inner_button(__('مزامنة من Press'), function () {
					frappe.confirm(
						`<div dir="rtl">سيتم سحب المواقع من Press وإنشاء سجلات العملاء الناقصة.<br>
						<b>المفاتيح الموجودة لن تُمس</b>، والسجلات الجديدة ستُنشأ بلا مفاتيح لتضيفها يدويًا.</div>`,
						function () {
							frappe.dom.freeze(__('جارٍ المزامنة...'));
							frappe.call({
								method: 'mubtkir_ai_creator.lib.press_sync.run_sync',
								args: { create_only_active: 1 },
								callback: function (res) {
									frappe.dom.unfreeze();
									const m = res.message || {};
									let html = `<div dir="rtl">
										مواقع Press: <b>${m.total_press_sites}</b><br>
										أُنشئت: <b>${m.created}</b> — حُدِّثت: <b>${m.updated}</b> — بلا تغيير: <b>${m.skipped}</b>`;
									if ((m.needs_key || []).length) {
										html += `<br><br><b>بانتظار مفاتيح API (${m.needs_key.length}):</b><br>
											${frappe.utils.escape_html(m.needs_key.slice(0, 20).join('، '))}`;
									}
									html += '</div>';
									frappe.msgprint({ title: __('نتيجة المزامنة'), indicator: 'blue', message: html });
									listview.refresh();
								},
								error: () => frappe.dom.unfreeze(),
							});
						}
					);
				});
			},
		});
	},
};
