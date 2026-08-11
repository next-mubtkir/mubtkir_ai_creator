frappe.ui.form.on('AI Import', {
	refresh: function (frm) {
		if (frm.is_new()) return;
		const st = frm.doc.status;

		if (['Draft', 'Mapping Ready'].includes(st) && frm.doc.source_file) {
			frm.add_custom_button(__('١. تحليل الملف'), function () {
				frappe.dom.freeze(__('جارٍ قراءة الملف وبناء خريطة الحقول...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.analyze',
					args: { name: frm.doc.name },
					callback: function (r) {
						frappe.dom.unfreeze();
						frm.reload_doc();
						const m = r.message || {};
						frappe.msgprint({
							title: __('تم التحليل'),
							indicator: 'blue',
							message: `<div dir="rtl">عدد الصفوف: <b>${m.total_rows}</b><br><br>
								راجع <b>خريطة الحقول</b> وعدّلها إن لزم، ثم اضغط «معاينة».</div>`,
						});
					},
					error: () => frappe.dom.unfreeze(),
				});
			}).addClass('btn-primary');
		}

		if (['Mapping Ready', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('٢. معاينة'), function () {
				frappe.dom.freeze(__('جارٍ فحص كل الصفوف...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.run_preview',
					args: { name: frm.doc.name },
					callback: function (r) {
						frappe.dom.unfreeze();
						frm.reload_doc();
						const m = r.message || {};
						let html = `<div dir="rtl"><b>${frappe.utils.escape_html(m.summary || '')}</b>`;

						const bad = m.invalid_links || {};
						if (Object.keys(bad).length) {
							html += '<br><br><b>قيم ربط غير موجودة لدى العميل:</b><ul>';
							for (const f in bad) {
								html += `<li>${frappe.utils.escape_html(f)}: ${frappe.utils.escape_html(
									(bad[f].values || []).slice(0, 8).join('، ')
								)}<br><small>المتاح: ${frappe.utils.escape_html(
									(bad[f].available_options || []).slice(0, 8).join('، ')
								)}</small></li>`;
							}
							html += '</ul>';
						}
						html += '</div>';
						frappe.msgprint({ title: __('نتيجة المعاينة'), indicator: m.invalid ? 'orange' : 'green', message: html });
					},
					error: () => frappe.dom.unfreeze(),
				});
			}).addClass('btn-primary');
		}

		if (st === 'Pending Approval') {
			frm.add_custom_button(__('٣. اعتماد وتنفيذ'), function () {
				frappe.confirm(
					`<div dir="rtl">سيتم إنشاء <b>${frm.doc.valid_rows}</b> مستند في حساب <b>${frappe.utils.escape_html(
						frm.doc.client_site
					)}</b>.<br>
					صفوف بها مشاكل: <b>${frm.doc.invalid_rows}</b> ${
						frm.doc.skip_invalid_rows ? '(ستُتخطّى)' : '(سيتوقف الاستيراد عندها)'
					}<br><br><b>هل تريد المتابعة؟</b></div>`,
					function () {
						frappe.call({
							method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.approve_and_run',
							args: { name: frm.doc.name },
							callback: function () {
								frm.reload_doc();
								frappe.show_alert({ message: __('بدأ التنفيذ في الخلفية'), indicator: 'blue' }, 5);
							},
						});
					}
				);
			}).addClass('btn-danger');
		}

		// متابعة التقدّم أثناء التنفيذ الخلفي
		if (['Queued', 'Executing'].includes(st)) {
			const total = frm.doc.total_rows || 1;
			const done = frm.doc.processed_rows || 0;
			frm.dashboard.add_progress(__('تقدّم الاستيراد'), [
				{ title: `${done} / ${total}`, width: ((done / total) * 100).toFixed(0) + '%', progress_class: 'progress-bar-success' },
			]);
			setTimeout(() => frm.reload_doc(), 5000);
		}

		if (['Completed', 'Partially Failed', 'Failed'].includes(st) && frm.doc.failure_report) {
			frm.add_custom_button(__('نسخ تقرير الفشل'), function () {
				frappe.utils.copy_to_clipboard(frm.doc.failure_report);
				frappe.show_alert({ message: __('تم النسخ'), indicator: 'green' }, 3);
			});
		}
	},
});
