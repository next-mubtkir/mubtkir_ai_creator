frappe.ui.form.on('AI Import', {
	refresh: function (frm) {
		load_target_doctype_options(frm);
		if (frm.is_new()) return;

		var st = frm.doc.status;
		var has_source = !!(frm.doc.source_file || frm.doc.google_sheet_url);

		// ===== أزرار الخطوات =====
		if (['Draft', 'Mapping Ready'].includes(st) && has_source) {
			frm.add_custom_button(__('١. تحليل الملف'), function () {
				frappe.dom.freeze(__('جارٍ قراءة الملف وبناء خريطة الحقول...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.analyze',
					args: { name: frm.doc.name },
					callback: function () { frappe.dom.unfreeze(); frm.reload_doc(); },
					error: function () { frappe.dom.unfreeze(); },
				});
			}, __('خطوات'));
		}

		if (['Mapping Ready', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('٢. معاينة'), function () {
				frappe.dom.freeze(__('جارٍ فحص كل الصفوف...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.run_preview',
					args: { name: frm.doc.name },
					callback: function () { frappe.dom.unfreeze(); frm.reload_doc(); },
					error: function () { frappe.dom.unfreeze(); },
				});
			}, __('خطوات'));
		}

		if (st === 'Pending Approval') {
			frm.add_custom_button(__('٣. اعتماد وتنفيذ'), function () {
				frappe.confirm(
					'<div dir="rtl">سيتم إنشاء <b>' + (frm.doc.valid_rows || 0) + '</b> مستند.<br>' +
					'صفوف بها مشاكل: <b>' + (frm.doc.invalid_rows || 0) + '</b><br><br><b>هل تريد المتابعة؟</b></div>',
					function () {
						frappe.call({
							method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.approve_and_run',
							args: { name: frm.doc.name },
							callback: function () { frm.reload_doc(); },
						});
					}
				);
			}, __('خطوات'));
		}

		// ===== Map Columns =====
		if (['Mapping Ready', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('Map Columns'), function () {
				open_map_columns_dialog(frm);
			});
		}

		// ===== تنزيل الفاشلة =====
		if (['Completed', 'Partially Failed', 'Failed'].includes(st)) {
			frm.add_custom_button(__('تنزيل الصفوف الفاشلة'), function () {
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.download_failure_rows',
					args: { name: frm.doc.name },
					freeze: true,
					callback: function (r) {
						var url = (r.message || {}).file_url;
						if (url) window.open(url, '_blank');
					},
				});
			});
		}

		// ===== شريط التقدّم =====
		if (['Queued', 'Executing'].includes(st)) {
			var total = frm.doc.total_rows || 1;
			var done = frm.doc.processed_rows || 0;
			var pct = Math.round((done / total) * 100);
			frm.dashboard.add_progress(__('التنفيذ'), pct, __('تم معالجة {0} من {1}', [done, total]));
			setTimeout(function () { frm.reload_doc(); }, 2000);
		}

		// ===== عرض الأخطاء (أعمدة غير مربوطة) =====
		render_unmatched_warnings(frm);
	},

	client_site: function (frm) {
		load_target_doctype_options(frm);
	},
});


function load_target_doctype_options(frm) {
	if (!frm.doc.client_site) return;
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.get_client_doctypes',
		args: { client_site: frm.doc.client_site },
		async: false,
		callback: function (r) {
			var list = r.message || [];
			var $input = frm.fields_dict.target_doctype && frm.fields_dict.target_doctype.$input;
			if ($input && $input.length) {
				if ($input[0]._awesomplete) {
					$input[0]._awesomplete.list = list;
				} else {
					var aw = new Awesomplete($input[0], { list: list, minChars: 0, maxItems: 20 });
					$input[0]._awesomplete = aw;
					$input.on('focus', function () { aw.evaluate(); });
				}
			}
		},
	});
}


function render_unmatched_warnings(frm) {
	$('.ai-import-warnings').remove();
	var mappingRows = frm.doc.field_mapping || [];
	if (!mappingRows.length) return;

	var unmatched = mappingRows.filter(function (r) { return !r.target_fieldname; });
	if (!unmatched.length) return;

	var $section = frm.fields_dict.mapping_section ? $(frm.fields_dict.mapping_section.wrapper) : $(frm.body);
	var $warn = $('<div class="ai-import-warnings" dir="ltr" style="margin:12px 0;padding:12px;border:1px solid #fca5a5;border-radius:6px;background:#fef2f2"></div>');
	$warn.append('<h5 style="margin:0 0 8px;color:#b91c1c">Import File Errors and Warnings</h5>');
	unmatched.forEach(function (r, i) {
		$warn.append(
			'<div style="margin:6px 0"><b>COLUMN ' + (i + 1) + '</b> (' +
			frappe.utils.escape_html(r.source_column) + ')<br>' +
			'<span style="color:#6b7280">Cannot match column ' +
			frappe.utils.escape_html(r.source_column) + ' with any field' +
			(r.sample_value ? ' — example: ' + frappe.utils.escape_html(r.sample_value) : '') +
			'</span></div>'
		);
	});
	$section.before($warn);
}


function open_map_columns_dialog(frm) {
	if (!frm.doc.client_site || !frm.doc.target_doctype) {
		frappe.msgprint(__('حدد العميل والـ DocType المستهدف أولًا'));
		return;
	}
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.get_target_fields',
		args: { client_site: frm.doc.client_site, target_doctype: frm.doc.target_doctype },
		freeze: true,
		callback: function (r) {
			var fields = r.message || [];
			var optionsList = [''].concat(fields.map(function (f) { return f.fieldname; }));
			var labels = { '': '— تجاهل —' };
			fields.forEach(function (f) {
				labels[f.fieldname] = f.label + ' (' + f.fieldname + ')' + (f.reqd ? ' *' : '');
			});

			var dialogFields = (frm.doc.field_mapping || []).map(function (row, i) {
				return {
					fieldname: 'col_' + i,
					label: row.source_column + (row.sample_value ? '  [' + row.sample_value.substring(0, 30) + ']' : ''),
					fieldtype: 'Select',
					options: optionsList.join('\n'),
					default: row.target_fieldname || '',
				};
			});

			var d = new frappe.ui.Dialog({
				title: __('Map Columns'),
				fields: dialogFields,
				size: 'large',
				primary_action_label: __('حفظ'),
				primary_action: function (values) {
					(frm.doc.field_mapping || []).forEach(function (row, i) {
						frappe.model.set_value(row.doctype, row.name, 'target_fieldname', values['col_' + i] || '');
					});
					frm.dirty();
					frm.save().then(function () { d.hide(); frm.reload_doc(); });
				},
			});

			d.fields_list.forEach(function (f) {
				if (f.df.fieldtype !== 'Select') return;
				f.$input.find('option').each(function () {
					var val = $(this).val();
					if (labels[val]) $(this).text(labels[val]);
				});
			});

			d.show();
		},
	});
}
