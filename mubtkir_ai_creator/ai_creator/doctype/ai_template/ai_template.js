frappe.ui.form.on('AI Template', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		if (frm.doc.deployable && ['Print Format', 'Custom Field'].includes(frm.doc.artifact_type)) {
			frm.add_custom_button(__('Create Bulk Deployment from this Template'), function () {
				frappe.call({
					method:
						'mubtkir_ai_creator.ai_creator.doctype.ai_template.ai_template.create_deployment_from_template',
					args: { name: frm.doc.name },
					callback: function (r) {
						if ((r.message || {}).deployment) {
							frappe.set_route('Form', 'AI Deployment', r.message.deployment);
						}
					},
				});
			}).addClass('btn-primary');
		}

		frm.add_custom_button(__('نسخ المحتوى'), function () {
			frappe.utils.copy_to_clipboard(frm.doc.payload || '');
			frappe.show_alert({ message: __('تم النسخ'), indicator: 'green' }, 3);
		});

		if (frm.doc.artifact_type === 'Server Script') {
			frm.dashboard.add_comment(
				'<div dir="rtl">هذا القالب <b>للتوثيق والتصدير فقط</b>. Server Script كود يعمل على سيرفر العميل، ونشره على عميل آخر قد يعطّل عمله أو يتلف بياناته.</div>',
				'orange',
				true
			);
		}

		if (frm.doc.previous_version) {
			frm.dashboard.set_headline_alert(
				`<span class="indicator blue">النسخة ${frm.doc.version} — توجد نسخ أقدم لهذا العنصر</span>`
			);
		}
	},
});
