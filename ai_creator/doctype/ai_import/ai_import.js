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
				var invalid = frm.doc.invalid_rows || 0;
				var msg = '<div dir="rtl">سيتم إنشاء <b>' + (frm.doc.valid_rows || 0) + '</b> مستند.<br>';
				if (invalid > 0) {
					msg += 'صفوف بها مشاكل: <b>' + invalid + '</b> — ' +
						'<span style="color:#b91c1c">سيتم تجاوزها تلقائيًا وتنفيذ باقي الصفوف السليمة فقط.</span><br>';
				}
				msg += '<br><b>هل تريد المتابعة؟</b></div>';
				frappe.confirm(msg, function () {
					frappe.call({
						method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.approve_and_run',
						args: { name: frm.doc.name },
						callback: function () { frm.reload_doc(); },
					});
				});
			}, __('خطوات'));
		}

		// ===== شريط التقدّم =====
		if (['Queued', 'Executing'].includes(st)) {
			var total = frm.doc.total_rows || 1;
			var done = frm.doc.processed_rows || 0;
			var pct = Math.round((done / total) * 100);
			frm.dashboard.add_progress(__('التنفيذ'), pct, __('تم معالجة {0} من {1}', [done, total]));
			setTimeout(function () { frm.reload_doc(); }, 2000);
		}

		// ===== ملخص نتيجة التنفيذ (يوضح كم صف تم تجاوزه من المعاينة) =====
		if (['Completed', 'Partially Failed', 'Failed'].includes(st)) {
			render_result_summary(frm);
		}

		// ===== المعاينة والتحذيرات =====
		render_preview_table(frm);
		render_warnings_section(frm);
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


// ---------------- ملخص نتيجة التنفيذ ----------------

function render_result_summary(frm) {
	if (!frm.doc.failure_report) return;
	var failures = [];
	try { failures = JSON.parse(frm.doc.failure_report) || []; } catch (e) { failures = []; }
	var skipped = failures.filter(function (f) { return f.skipped_at_preview; }).length;
	if (!skipped) return;

	$('.ai-import-result-note').remove();
	var $note = $(
		'<div class="ai-import-result-note" style="margin:10px 0;padding:8px 12px;' +
		'border-radius:6px;background:#f3f4f6;color:#374151;font-size:13px">' +
		frappe.utils.escape_html(
			__('من إجمالي {0} صف فاشل، تم تجاوز {1} صف تلقائيًا لأنها رُصدت كمشاكل أثناء المعاينة (لم تُرسَل للعميل إطلاقًا).', [failures.length, skipped])
		) + '</div>'
	);
	if (frm.dashboard && frm.dashboard.wrapper) {
		$(frm.dashboard.wrapper).after($note);
	}
}


// ---------------- جدول المعاينة (frappe-datatable) ----------------

function render_preview_table(frm) {
	var $wrapper = frm.fields_dict.preview_html && $(frm.fields_dict.preview_html.wrapper);
	if (!$wrapper) return;
	$wrapper.empty();

	if (!frm.doc.preview_result) {
		return;
	}

	var preview;
	try { preview = JSON.parse(frm.doc.preview_result); } catch (e) { return; }
	if (!preview || !preview.columns || !preview.columns.length) return;

	$wrapper.html(
		'<div class="ai-import-preview">' +
		'<div class="table-actions margin-bottom" style="margin-bottom:8px"></div>' +
		'<div class="table-preview border"></div>' +
		'<div class="table-message"></div>' +
		'</div>'
	);

	var $actions = $wrapper.find('.table-actions');
	var $tablePreview = $wrapper.find('.table-preview');

	// ---- أزرار الإجراءات (نفس ترتيب Data Import الأصلي) ----
	var $mapBtn = $('<button class="btn btn-sm btn-default" style="margin-inline-end:6px">' + __('Map Columns') + '</button>');
	$mapBtn.on('click', function () { open_map_columns_dialog(frm); });
	$actions.append($mapBtn);

	if (['Completed', 'Partially Failed', 'Failed'].includes(frm.doc.status)) {
		var $exportBtn = $('<button class="btn btn-sm btn-default" style="margin-inline-end:6px">' + __('Export Errored Rows') + '</button>');
		$exportBtn.on('click', function () {
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
		$actions.append($exportBtn);
	}

	var hasWarnings = (preview.columns || []).some(function (c) { return !c.mapped; }) ||
		(preview.rows || []).some(function (r) { return !r.ok; });
	if (hasWarnings) {
		var $warnBtn = $('<button class="btn btn-sm btn-default">' + __('Show Warnings') + '</button>');
		$warnBtn.on('click', function () { frm.scroll_to_field('import_warnings'); });
		$actions.append($warnBtn);
	}

	// ---- بناء أعمدة DataTable: رقم تسلسلي + عمود لكل حقل ----
	var columns = [{ id: 'srno', name: 'Sr. No', content: 'Sr. No', editable: false, focusable: false, align: 'left', width: 60 }];
	(preview.columns || []).forEach(function (col, i) {
		if (col.mapped) {
			columns.push({
				id: col.fieldname || ('col_' + i),
				name: col.source_column,
				content: '<span class="indicator green">' + frappe.utils.escape_html(col.label || col.source_column) + '</span>',
				editable: false,
				align: 'left',
				width: 140,
			});
		} else {
			columns.push({
				id: 'unmapped_' + i,
				name: col.source_column,
				content: '<span class="indicator red">' + frappe.utils.escape_html(col.source_column || __('Untitled Column')) + '</span>',
				editable: false,
				focusable: false,
				align: 'left',
				width: 160,
				format: function (value) { return '<div class="text-muted">' + (value || '') + '</div>'; },
			});
		}
	});

	// ---- بيانات الصفوف ----
	var data = (preview.rows || []).map(function (row) {
		return [row.row_number].concat(row.values || []);
	});

	if (typeof DataTable === 'undefined' || !window.DataTable) {
		// fallback نادر لو المكتبة غير محمّلة لأي سبب — جدول HTML بسيط بنفس الألوان
		render_fallback_table($tablePreview, columns, data);
	} else {
		var datatable = new DataTable($tablePreview.get(0), {
			data: data,
			columns: columns,
			layout: columns.length < 10 ? 'fluid' : 'fixed',
			cellHeight: 35,
			serialNoColumn: false,
			checkboxColumn: false,
			noDataMessage: __('No Data'),
			disableReorderColumn: true,
		});

		// تظليل الصفوف التي بها مشاكل — نفس فكرة تمييز الصفوف في الأصلي
		var invalidRowIndexes = (preview.rows || [])
			.map(function (r, idx) { return { r: r, idx: idx }; })
			.filter(function (x) { return !x.r.ok; })
			.map(function (x) { return x.idx; });
		if (invalidRowIndexes.length) {
			var sel = invalidRowIndexes.map(function (i) { return '.dt-row-' + i + ' .dt-cell'; }).join(',');
			datatable.style.setStyle(sel, { backgroundColor: '#fef2f2' });
		}
	}

	if (preview.max_rows_exceeded) {
		$wrapper.find('.table-message').html(
			'<div class="text-muted margin-top text-medium" style="margin-top:6px">' +
			__('Showing only first {0} rows in preview', [preview.max_rows_in_preview]) +
			'</div>'
		);
	}
}


function render_fallback_table($container, columns, data) {
	var $t = $('<table class="table table-bordered" style="font-size:12px"></table>');
	var $thead = $('<thead><tr></tr></thead>');
	columns.forEach(function (c) { $thead.find('tr').append('<th>' + c.content + '</th>'); });
	$t.append($thead);
	var $tbody = $('<tbody></tbody>');
	data.forEach(function (row) {
		var $tr = $('<tr></tr>');
		row.forEach(function (cell) { $tr.append('<td>' + (cell == null ? '' : frappe.utils.escape_html(String(cell))) + '</td>'); });
		$tbody.append($tr);
	});
	$t.append($tbody);
	$container.empty().append($t);
}


// ---------------- قسم التحذيرات (Import Warnings) ----------------

function render_warnings_section(frm) {
	var $wrapper = frm.fields_dict.import_warnings && $(frm.fields_dict.import_warnings.wrapper);
	if (!$wrapper) return;
	$wrapper.empty();

	var unmapped = (frm.doc.field_mapping || []).filter(function (r) { return !r.target_fieldname; });
	var invalidRows = {};
	if (frm.doc.invalid_row_numbers) {
		try { invalidRows = JSON.parse(frm.doc.invalid_row_numbers) || {}; } catch (e) { invalidRows = {}; }
	}
	var invalidCount = Object.keys(invalidRows).length;

	if (!unmapped.length && !invalidCount) return;

	var $box = $('<div class="ai-import-warnings" style="padding:10px 0"></div>');

	if (unmapped.length) {
		$box.append('<div style="font-weight:600;margin-bottom:6px">' + __('Unmapped Columns') + '</div>');
		unmapped.forEach(function (r) {
			$box.append(
				'<div style="margin:4px 0;padding:6px 10px;border-inline-start:3px solid #ef4444;background:#fef2f2">' +
				'<b>' + frappe.utils.escape_html(r.source_column) + '</b>' +
				'<span class="text-muted"> — ' + __('Cannot match this column with any field') +
				(r.sample_value ? ' (' + frappe.utils.escape_html(r.sample_value) + ')' : '') + '</span>' +
				'</div>'
			);
		});
	}

	if (invalidCount) {
		$box.append('<div style="font-weight:600;margin:12px 0 6px">' + __('Row Issues') + ' (' + invalidCount + ')</div>');
		var shown = 0;
		Object.keys(invalidRows).forEach(function (rowNo) {
			if (shown >= 30) return; // حماية من قائمة ضخمة على شاشة صغيرة
			shown++;
			$box.append(
				'<div style="margin:4px 0;padding:6px 10px;border-inline-start:3px solid #f59e0b;background:#fffbeb">' +
				'<b>' + __('Row {0}', [rowNo]) + '</b>' +
				'<div class="text-muted">' + frappe.utils.escape_html((invalidRows[rowNo] || []).join(' | ')) + '</div>' +
				'</div>'
			);
		});
		if (invalidCount > shown) {
			$box.append('<div class="text-muted" style="margin-top:4px">' + __('+ {0} more', [invalidCount - shown]) + '</div>');
		}
	}

	$wrapper.append($box);
}


// ---------------- Map Columns (Autocomplete — بنفس أسلوب الأصلي) ----------------

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
			var options = [{ label: __("Don't Import"), value: "Don't Import" }].concat(
				fields.map(function (f) {
					return { label: f.label + ' (' + f.fieldname + ')' + (f.reqd ? ' *' : ''), value: f.fieldname };
				})
			);

			var mappingRows = frm.doc.field_mapping || [];
			var dialogFields = [
				{
					fieldtype: 'HTML',
					fieldname: 'heading',
					options: '<div class="margin-top text-muted">' +
						__('Map columns from {0} to fields in {1}', [
							'<b>' + frappe.utils.escape_html(frm.doc.source_file ? frm.doc.source_file.split('/').pop() : 'Google Sheet') + '</b>',
							'<b>' + frappe.utils.escape_html(frm.doc.target_doctype) + '</b>',
						]) + '</div>',
				},
				{ fieldtype: 'Section Break' },
			];

			mappingRows.forEach(function (row, i) {
				dialogFields.push({
					label: row.source_column + (row.sample_value ? '  [' + row.sample_value.substring(0, 30) + ']' : ''),
					fieldtype: 'Data',
					fieldname: 'label_' + i,
					read_only: 1,
					default: '',
				});
				dialogFields.push({
					fieldtype: 'Autocomplete',
					fieldname: 'col_' + i,
					label: '',
					options: options,
					default: row.target_fieldname || "Don't Import",
				});
				dialogFields.push({ fieldtype: 'Section Break' });
			});

			var d = new frappe.ui.Dialog({
				title: __('Map Columns'),
				fields: dialogFields,
				size: 'large',
				primary_action_label: __('حفظ'),
				primary_action: function (values) {
					mappingRows.forEach(function (row, i) {
						var v = values['col_' + i];
						var fieldname = (v && v !== "Don't Import") ? v : '';
						frappe.model.set_value(row.doctype, row.name, 'target_fieldname', fieldname);
					});
					frm.dirty();
					frm.save().then(function () { d.hide(); frm.reload_doc(); });
				},
			});

			d.$body.addClass('map-columns');
			d.show();
		},
	});
}
