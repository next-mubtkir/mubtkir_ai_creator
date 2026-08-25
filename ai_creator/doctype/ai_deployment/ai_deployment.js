frappe.ui.form.on('AI Deployment', {
	refresh: function (frm) {
		if (frm.is_new()) return;

		const st = frm.doc.status;

		if (['Draft', 'Previewed', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('معاينة التوافق'), function () {
				frappe.dom.freeze(__('جارٍ فحص كل عميل...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_deployment.ai_deployment.run_preview',
					args: { name: frm.doc.name },
					callback: function (r) {
						frappe.dom.unfreeze();
						frm.reload_doc();
						frappe.msgprint({
							title: __('نتيجة المعاينة'),
							indicator: 'blue',
							message: `<div dir="rtl"><b>${frappe.utils.escape_html(
								(r.message || {}).summary || ''
							)}</b><br><br>راجع جدول الأهداف لتفاصيل كل عميل قبل الاعتماد.</div>`,
						});
					},
					error: () => frappe.dom.unfreeze(),
				});
			}).addClass('btn-primary');
		}

		if (st === 'Pending Approval') {
			frm.add_custom_button(__('اعتماد وتنفيذ'), function () {
				const bad = (frm.doc.targets || []).filter((t) => t.compatibility === 'Incompatible').length;
				const warn = (frm.doc.targets || []).filter((t) => t.compatibility === 'Warning').length;

				frappe.confirm(
					`<div dir="rtl">سيتم التطبيق على <b>${
						(frm.doc.targets || []).length
					}</b> عميل.<br>غير متوافق: <b>${bad}</b> — تحذير: <b>${warn}</b><br><br>
					العملاء غير المتوافقين سيُسجَّل فشلهم دون إيقاف الباقي.<br>
					<b>هل تريد المتابعة؟</b></div>`,
					function () {
						frappe.dom.freeze(__('جارٍ التنفيذ على العملاء...'));
						frappe.call({
							method:
								'mubtkir_ai_creator.ai_creator.doctype.ai_deployment.ai_deployment.approve_and_execute',
							args: { name: frm.doc.name },
							callback: function (r) {
								frappe.dom.unfreeze();
								frm.reload_doc();
								const o = r.message || {};
								frappe.msgprint({
									title: __('انتهى التنفيذ'),
									indicator: o.failed ? 'orange' : 'green',
									message: `<div dir="rtl">نجح: <b>${o.success}</b> — فشل: <b>${o.failed}</b> — تُخطّي: <b>${o.skipped}</b></div>`,
								});
							},
							error: () => frappe.dom.unfreeze(),
						});
					}
				);
			}).addClass('btn-danger');
		}

		if (['Completed', 'Partially Failed', 'Failed'].includes(st)) {
			frm.add_custom_button(__('نسخ تقرير النتائج'), function () {
				const lines = [
					`عملية النشر: ${frm.doc.name} — ${frm.doc.title || ''}`,
					`النوع: ${frm.doc.deployment_type}`,
					`الحالة: ${frm.doc.status}`,
					`نجح: ${frm.doc.success_count} | فشل: ${frm.doc.failed_count} | تُخطّي: ${frm.doc.skipped_count}`,
					'',
					'--- تفاصيل كل عميل ---',
					...(frm.doc.targets || []).map(
						(t) => `${t.client_site}: ${t.status} — ${t.result || ''}`
					),
				];
				frappe.utils.copy_to_clipboard(lines.join('\n'));
				frappe.show_alert({ message: __('تم نسخ التقرير'), indicator: 'green' }, 3);
			});
		}

		// شريط حالة
		const colors = {
			Completed: 'green', 'Partially Failed': 'orange', Failed: 'red',
			Executing: 'blue', 'Pending Approval': 'orange', Previewed: 'blue', Draft: 'grey',
		};
		if (frm.doc.preview_summary) {
			frm.dashboard.set_headline_alert(
				`<span class="indicator ${colors[st] || 'grey'}">${frappe.utils.escape_html(
					frm.doc.preview_summary
				)}</span>`
			);
		}
	},

	deployment_type: function (frm) {
		const hints = {
			'Print Format': 'اسم الـ Print Format لدى العميل المصدر',
			'Custom Field': 'اسم Custom Field لدى المصدر (مثل: Sales Invoice-contract_no)',
			Settings: 'اسم DocType الإعدادات (مثل: Stock Settings)',
		};
		frm.set_df_property('source_record', 'description', hints[frm.doc.deployment_type] || '');
		frm.refresh_field('source_record');
	},
});
