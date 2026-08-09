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
