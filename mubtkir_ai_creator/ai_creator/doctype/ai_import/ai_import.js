frappe.ui.form.on('AI Import', {
	refresh: function (frm) {
		load_target_doctype_options(frm);
		if (frm.is_new()) return;

		const st = frm.doc.status;
		const has_source = !!(frm.doc.source_file || frm.doc.google_sheet_url);

		// ===== أزرار التنفيذ المرقّمة — تُعرض كأزرار Frappe عادية في الشريط العلوي =====
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
					'<div dir="rtl">سيتم إنشاء <b>' + (frm.doc.valid_rows || 0) + '</b> مستند في حساب <b>' +
					frappe.utils.escape_html(frm.doc.client_site || '') + '</b>.<br>' +
					'صفوف بها مشاكل: <b>' + (frm.doc.invalid_rows || 0) + '</b> ' +
					(frm.doc.skip_invalid_rows ? '(ستُتخطّى)' : '(سيتوقف الاستيراد عندها)') +
					'<br><br><b>هل تريد المتابعة؟</b></div>',
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
			}, __('خطوات'));
		}

		// ===== Map Columns =====
		if (['Mapping Ready', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('Map Columns'), function () {
				open_map_columns_dialog(frm);
			});
		}

		// ===== تنزيل الفاشلة =====
		if (['Completed', 'Partially Failed', 'Failed'].includes(st) && (frm.doc.failure_report || frm.doc.invalid_rows)) {
			frm.add_custom_button(__('تنزيل الصفوف الفاشلة'), function () {
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.download_failure_rows',
					args: { name: frm.doc.name },
					freeze: true,
					callback: function (r) {
						const url = (r.message || {}).file_url;
						if (url) window.open(url, '_blank');
					},
				});
			});
		}

		// ===== شريط التقدّم أثناء التنفيذ =====
		if (['Queued', 'Executing'].includes(st)) {
			const total = frm.doc.total_rows || 1;
			const done = frm.doc.processed_rows || 0;
			const pct = Math.round((done / total) * 100);
			frm.dashboard.add_progress(__('التنفيذ'), pct, __('تم معالجة {0} من {1}', [done, total]));
			setTimeout(function () { frm.reload_doc(); }, 2000);
		}

		// ===== عرض الأخطاء والعينات بعد التحليل =====
		render_import_sections(frm);
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


function render_import_sections(frm) {
	// تنظيف أي عرض سابق
	$(frm.fields_dict.analysis_notes && frm.fields_dict.analysis_notes.wrapper).closest('.frappe-control').siblings('.ai-import-custom').remove();
	$('.ai-import-custom').remove();

	const mappingRows = frm.doc.field_mapping || [];
	if (!mappingRows.length) return;

	const $target = frm.fields_dict.mapping_section
		? $(frm.fields_dict.mapping_section.wrapper)
		: $(frm.body);

	// --- Import File Errors and Warnings ---
	const unmatched = mappingRows.filter(function (r) { return !r.target_fieldname; });
	if (unmatched.length) {
		const $err = $('<div class="ai-import-custom" dir="ltr" style="margin:12px 0;padding:12px;border:1px solid #f0c0c0;border-radius:6px;background:#fef2f2"></div>');
		$err.append('<h5 style="margin:0 0 8px;color:#b91c1c">Import File Errors and Warnings</h5>');
		unmatched.forEach(function (r, i) {
			$err.append(
				'<div style="margin:8px 0"><b>COLUMN ' + (i + 1) + '</b> (' +
				frappe.utils.escape_html(r.source_column) + ')<br>' +
				'<span style="color:#6b7280">Cannot match column ' +
				frappe.utils.escape_html(r.source_column) + ' with any field' +
				(r.sample_value ? ' — example: ' + frappe.utils.escape_html(r.sample_value) : '') +
				'</span></div>'
			);
		});
		$target.before($err);
	}

	// --- Preview: 5-row sample table ---
	var sample = [];
	try { sample = JSON.parse(frm.doc.sample_rows || '[]'); } catch (e) { sample = []; }
	if (sample.length) {
		var headers = mappingRows.map(function (r) { return r.source_column; });
		var $prev = $('<div class="ai-import-custom" dir="ltr" style="margin:12px 0"></div>');
		$prev.append('<h5 style="margin:0 0 8px">Preview</h5>');

		var $btns = $('<div style="display:flex;gap:8px;margin-bottom:8px"></div>');
		var $mapBtn = $('<button class="btn btn-sm btn-default">Map Columns</button>');
		var $warnBtn = $('<button class="btn btn-sm btn-default">Show Warnings</button>');
		$mapBtn.on('click', function () { open_map_columns_dialog(frm); });
		$warnBtn.on('click', function () { open_warnings_dialog(frm); });
		$btns.append($mapBtn).append($warnBtn);
		$prev.append($btns);

		var tableHtml = '<div style="overflow-x:auto"><table class="table table-bordered" style="min-width:600px;font-size:12px"><thead><tr><th>Sr.</th>';
		headers.forEach(function (h) {
			var row = mappingRows.find(function (r) { return r.source_column === h; });
			var warn = (row && !row.target_fieldname) ? ' <span style="color:#dc2626" title="Unmapped">⚠</span>' : '';
			tableHtml += '<th>' + frappe.utils.escape_html(h) + warn + '</th>';
		});
		tableHtml += '</tr></thead><tbody>';
		sample.forEach(function (row, i) {
			tableHtml += '<tr><td>' + (i + 1) + '</td>';
			headers.forEach(function (h) {
				tableHtml += '<td>' + frappe.utils.escape_html(String(row[h] != null ? row[h] : '')) + '</td>';
			});
			tableHtml += '</tr>';
		});
		tableHtml += '</tbody></table></div>';
		$prev.append(tableHtml);
		$target.before($prev);
	}

	// --- Preview result summary (بعد المعاينة) ---
	if (frm.doc.preview_result) {
		try {
			var parsed = JSON.parse(frm.doc.preview_result);
			var $res = $('<div class="ai-import-custom" dir="rtl" style="margin:12px 0;padding:12px;border-radius:6px;background:#f0fdf4;border:1px solid #86efac"></div>');
			$res.append('<b>' + frappe.utils.escape_html(parsed.summary || '') + '</b>');
			var bad = parsed.invalid_links || {};
			if (Object.keys(bad).length) {
				var linkHtml = '<br><br><b>قيم ربط غير موجودة لدى العميل:</b><ul>';
				for (var f in bad) {
					linkHtml += '<li>' + frappe.utils.escape_html(f) + ': ' +
						frappe.utils.escape_html((bad[f].values || []).slice(0, 8).join('، ')) +
						'<br><small>المتاح: ' +
						frappe.utils.escape_html((bad[f].available_options || []).slice(0, 8).join('، ')) +
						'</small></li>';
				}
				linkHtml += '</ul>';
				$res.append(linkHtml);
			}
			var issues = parsed.row_issues || [];
			if (issues.length) {
				$res.append('<br><b>أمثلة على الصفوف الفاشلة (أول 5):</b><ul>');
				issues.slice(0, 5).forEach(function (it) {
					$res.append('<li>صف ' + it.row + ': ' + frappe.utils.escape_html((it.issues || []).join('، ')) + '</li>');
				});
				$res.append('</ul>');
			}
			$target.before($res);
		} catch (e) { /* ignore */ }
	}
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
					label: row.source_column + (row.sample_value ? '  [مثال: ' + row.sample_value.substring(0, 30) + ']' : ''),
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
					frm.save().then(function () {
						d.hide();
						frm.reload_doc();
					});
				},
			});

			// عرض التسميات الودّية
			d.fields_list.forEach(function (f) {
				if (f.df.fieldtype !== 'Select') return;
				var $sel = f.$input;
				$sel.find('option').each(function () {
					var val = $(this).val();
					if (labels[val]) $(this).text(labels[val]);
				});
			});

			d.show();
		},
	});
}


function open_warnings_dialog(frm) {
	var parsed = {};
	try { parsed = JSON.parse(frm.doc.preview_result || '{}'); } catch (e) { parsed = {}; }
	var issues = parsed.row_issues || [];

	var d = new frappe.ui.Dialog({
		title: __('Show Warnings'),
		size: 'large',
		fields: [{ fieldname: 'html', fieldtype: 'HTML' }],
	});

	if (!issues.length) {
		d.fields_dict.html.$wrapper.html('<div dir="rtl">لا توجد تحذيرات — نفّذ المعاينة أولًا إن لم تظهر نتيجة</div>');
	} else {
		var html = '<div dir="rtl" style="max-height:400px;overflow:auto">' +
			'<table class="table table-bordered"><thead><tr><th>الصف</th><th>المشاكل</th></tr></thead><tbody>';
		issues.forEach(function (it) {
			html += '<tr><td>' + it.row + '</td><td>' +
				frappe.utils.escape_html((it.issues || []).join('، ')) + '</td></tr>';
		});
		html += '</tbody></table></div>';
		d.fields_dict.html.$wrapper.html(html);
	}

	d.show();
}
