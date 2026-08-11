frappe.ui.form.on('AI Action Log', {
	refresh: function (frm) {
		// فك ترميز \uXXXX لعرض النص العربي بدل الرموز
		const decode = (txt) => {
			if (!txt) return '';
			try {
				return txt.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
					String.fromCharCode(parseInt(h, 16))
				);
			} catch (e) {
				return txt;
			}
		};

		const copy = (text, label) => {
			frappe.utils.copy_to_clipboard(text);
			frappe.show_alert({ message: __('تم نسخ {0}', [label]), indicator: 'green' }, 3);
		};

		// زر التراجع عن هذه العملية (إن كانت قابلة للتراجع)
		if (frm.doc.is_success && ['update_document', 'update_print_format', 'patch_print_format_html', 'patch_document_field'].includes(frm.doc.tool_name) && frm.doc.value_before) {
			frappe.call({
				method: 'mubtkir_ai_creator.lib.rollback.check_can_rollback',
				args: { log_name: frm.doc.name },
				callback: function (r) {
					if (!(r.message || {}).can_rollback) return;

					frm.add_custom_button(__('التراجع عن هذا التغيير'), function () {
						frappe.confirm(
							`<div dir="rtl">سيُعاد الحقول التي عدّلتها هذه العملية فقط إلى قيمتها السابقة
							على حساب <b>${frappe.utils.escape_html(frm.doc.client_site || '')}</b>.<br>
							هذا إجراء فعلي على حساب العميل، لا يمكن التراجع عنه إلا بعملية تراجع أخرى.<br><br>
							<b>هل تريد المتابعة؟</b></div>`,
							function () {
								frappe.dom.freeze(__('جارٍ التراجع...'));
								frappe.call({
									method: 'mubtkir_ai_creator.lib.rollback.run_rollback',
									args: { log_name: frm.doc.name },
									callback: function (res) {
										frappe.dom.unfreeze();
										const m = res.message || {};
										frappe.show_alert(
											{ message: __('تم التراجع عن: {0}', [(m.restored_fields || []).join('، ')]), indicator: 'green' },
											6
										);
									},
									error: () => frappe.dom.unfreeze(),
								});
							}
						);
					}).addClass('btn-danger');
				},
			});
		}

		// زر نسخ التقرير الكامل
		frm.add_custom_button(__('نسخ تقرير الخطأ'), function () {
			const report = [
				`السجل: ${frm.doc.name}`,
				`الوقت: ${frm.doc.timestamp || ''}`,
				`العميل: ${frm.doc.client_site || ''}`,
				`الموقع: ${frm.doc.site_url || ''}`,
				`الجلسة: ${frm.doc.session || ''}`,
				`المهمة: ${frm.doc.task || ''}`,
				`الأداة: ${frm.doc.tool_name || ''}`,
				`مستوى الخطورة: ${frm.doc.risk_level || ''}`,
				`نجحت: ${frm.doc.is_success ? 'نعم' : 'لا'}`,
				`المدة: ${frm.doc.duration_ms || 0} ms`,
				'',
				'--- المدخلات ---',
				decode(frm.doc.tool_input || ''),
				'',
				'--- الخطأ ---',
				decode(frm.doc.error_message || ''),
				'',
				'--- استجابة API ---',
				decode(frm.doc.tool_output || ''),
			].join('\n');
			copy(report, __('التقرير الكامل'));
		}).addClass('btn-primary');

		// أزرار نسخ صغيرة فوق كل حقل نصي
		const add_copy = (fieldname, label) => {
			const value = frm.doc[fieldname];
			if (!value) return;

			const $wrapper = frm.get_field(fieldname).$wrapper;
			$wrapper.find('.ai-copy-bar').remove();

			const $bar = $(`
				<div class="ai-copy-bar" style="display:flex;gap:6px;margin-bottom:4px;">
					<button class="btn btn-xs btn-default ai-copy-raw">📋 نسخ</button>
					<button class="btn btn-xs btn-default ai-copy-dec">🔤 نسخ مقروء (عربي)</button>
				</div>
			`);
			$bar.find('.ai-copy-raw').on('click', () => copy(value, label));
			$bar.find('.ai-copy-dec').on('click', () => copy(decode(value), label));
			$wrapper.prepend($bar);
		};

		add_copy('error_message', __('نص الخطأ'));
		add_copy('tool_input', __('المدخلات'));
		add_copy('tool_output', __('استجابة API'));
		add_copy('value_before', __('القيم قبل'));
		add_copy('value_after', __('القيم بعد'));

		// عرض نسخة مقروءة من الخطأ أعلى النموذج
		if (frm.doc.error_message) {
			frm.dashboard.clear_headline();
			frm.dashboard.add_comment(
				`<div dir="rtl" style="white-space:pre-wrap;max-height:180px;overflow:auto;">
					<b>الخطأ (نص مقروء):</b><br>${frappe.utils.escape_html(decode(frm.doc.error_message)).slice(0, 2000)}
				</div>`,
				'red',
				true
			);
		}
	},
});
