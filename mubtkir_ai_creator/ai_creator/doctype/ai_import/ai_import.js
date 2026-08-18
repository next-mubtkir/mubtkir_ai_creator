frappe.ui.form.on('AI Import', {
	refresh: function (frm) {
		load_target_doctype_options(frm);
		frm.trigger('render_all_sections');

		if (frm.is_new()) return;

		var st = frm.doc.status;
		var has_source = !!(frm.doc.source_file || frm.doc.google_sheet_url);

		if (frm.doc.client_site && frm.doc.target_doctype) {
			frm.add_custom_button(__('Download Template'), function () {
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.get_template',
					args: { client_site: frm.doc.client_site, target_doctype: frm.doc.target_doctype },
					freeze: true,
					callback: function (r) {
						var url = (r.message || {}).file_url;
						if (url) window.open(url, '_blank');
					},
				});
			});
		}

		if (['Draft', 'Mapping Ready'].includes(st) && has_source) {
			frm.add_custom_button(__('Analyze File & Build Mapping'), function () {
				frappe.dom.freeze(__('Reading file and building column mapping...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.analyze',
					args: { name: frm.doc.name },
					callback: function () { frappe.dom.unfreeze(); frm.reload_doc(); },
					error: function () { frappe.dom.unfreeze(); },
				});
			});
		}

		if (['Mapping Ready', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('Refresh Preview'), function () {
				frappe.dom.freeze(__('Validating all rows...'));
				frappe.call({
					method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.run_preview',
					args: { name: frm.doc.name },
					callback: function () { frappe.dom.unfreeze(); frm.reload_doc(); },
					error: function () { frappe.dom.unfreeze(); },
				});
			});
		}

		if (st === 'Pending Approval' && frappe.user.has_role(['System Manager', 'AI Creator Supervisor'])) {
			frm.page.set_primary_action(__('Start Import'), function () {
				var invalid = frm.doc.invalid_rows || 0;
				var msg = '<div>' + __('This will process {0} rows on {1}.', ['<b>' + (frm.doc.total_rows || 0) + '</b>', '<b>' + frappe.utils.escape_html(frm.doc.client_site) + '</b>']) + '<br>';
				if (invalid > 0) {
					msg += __('{0} rows have known issues and will be skipped automatically — only clean rows will be imported.', ['<b>' + invalid + '</b>']) + '<br>';
				}
				msg += '<br><b>' + __('Continue?') + '</b></div>';
				frappe.confirm(msg, function () {
					frappe.call({
						method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.approve_and_run',
						args: { name: frm.doc.name },
						callback: function () { frm.reload_doc(); },
					});
				});
			});
		}

		if (['Queued', 'Executing'].includes(st)) {
			var total = frm.doc.total_rows || 1;
			var done = frm.doc.processed_rows || 0;
			var pct = Math.round((done / total) * 100);
			frm.dashboard.add_progress(__('Importing'), pct, __('Processed {0} of {1}', [done, total]));
			setTimeout(function () { frm.reload_doc(); }, 2000);
		}
	},

	client_site: function (frm) {
		load_target_doctype_options(frm);
		frm._target_fields_cache = null;
	},

	target_doctype: function (frm) {
		frm._target_fields_cache = null;
	},

	render_all_sections: function (frm) {
		render_warnings_section(frm);
		render_preview_table(frm);
		render_import_log(frm);
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


function get_target_fields_cached(frm, callback) {
	if (frm._target_fields_cache) { callback(frm._target_fields_cache); return; }
	if (!frm.doc.client_site || !frm.doc.target_doctype) { callback([]); return; }
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.get_target_fields',
		args: { client_site: frm.doc.client_site, target_doctype: frm.doc.target_doctype },
		callback: function (r) {
			frm._target_fields_cache = r.message || [];
			callback(frm._target_fields_cache);
		},
	});
}


// ---------------- Import File Errors and Warnings ----------------
// نص عادي بدون صناديق ملوّنة — مطابق تمامًا لأسلوب Frappe الأصلي

function render_warnings_section(frm) {
	var $wrapper = frm.fields_dict.import_file_warnings && $(frm.fields_dict.import_file_warnings.wrapper);
	if (!$wrapper) return;
	$wrapper.empty();

	var rows = frm.doc.field_mapping || [];
	if (!rows.length) return;

	get_target_fields_cached(frm, function (fields) {
		var labels = {};
		fields.forEach(function (f) { labels[f.fieldname] = f.label; });

		var $box = $('<div style="padding:8px 0"></div>');
		rows.forEach(function (r) {
			var line;
			if (r.target_fieldname) {
				var label = labels[r.target_fieldname] || r.target_fieldname;
				line = __('Mapping column {0} to field {1}', [
					'<b>' + frappe.utils.escape_html(r.source_column) + '</b>',
					'<b>' + frappe.utils.escape_html(label) + '</b>',
				]);
			} else {
				line = __('Cannot match column {0} with any field', ['<b>' + frappe.utils.escape_html(r.source_column) + '</b>']);
			}
			$box.append('<div style="margin:6px 0">' + line + '</div>');
		});
		$wrapper.empty().append($box);
	});
}


// ---------------- Preview (frappe-datatable) ----------------

function render_preview_table(frm) {
	var $wrapper = frm.fields_dict.preview_html && $(frm.fields_dict.preview_html.wrapper);
	if (!$wrapper) return;
	$wrapper.empty();

	if (!frm.doc.preview_result) return;

	var preview;
	try { preview = JSON.parse(frm.doc.preview_result); } catch (e) { return; }
	if (!preview || !preview.columns || !preview.columns.length) return;

	$wrapper.html(
		'<div class="ai-import-preview">' +
		'<div class="table-actions margin-bottom" style="margin-bottom:8px"></div>' +
		'<div class="table-preview border"></div>' +
		'<div class="table-message text-muted text-medium" style="margin-top:6px"></div>' +
		'</div>'
	);

	var $actions = $wrapper.find('.table-actions');
	var $tablePreview = $wrapper.find('.table-preview');

	var $mapBtn = $('<button class="btn btn-sm btn-default" style="margin-inline-end:6px">' + __('Map Columns') + '</button>');
	$mapBtn.on('click', function () { open_map_columns_dialog(frm); });
	$actions.append($mapBtn);

	var hasUnmapped = (preview.columns || []).some(function (c) { return !c.mapped; });
	if (hasUnmapped) {
		var $warnBtn = $('<button class="btn btn-sm btn-default">' + __('Show Warnings') + '</button>');
		$warnBtn.on('click', function () { frm.scroll_to_field('import_file_warnings'); });
		$actions.append($warnBtn);
	}

	var columns = [{ id: 'srno', name: 'Sr. No', content: 'Sr. No', editable: false, focusable: false, align: 'left', width: 70 }];
	(preview.columns || []).forEach(function (col, i) {
		if (col.mapped) {
			columns.push({
				id: 'col_' + i,
				name: col.source_column,
				content: '<span class="indicator green">' + frappe.utils.escape_html(col.source_column) + '</span>',
				editable: false, align: 'left', width: 150,
			});
		} else {
			columns.push({
				id: 'col_' + i,
				name: col.source_column,
				content: '<span class="indicator red">' + frappe.utils.escape_html(col.source_column || __('Untitled Column')) +
					' <i class="octicon octicon-alert" title="' + __('Cannot match column with any field') + '"></i></span>',
				editable: false, focusable: false, align: 'left', width: 160,
			});
		}
	});

	var data = (preview.rows || []).map(function (row) {
		return [row.row_number].concat(row.values || []);
	});

	if (typeof DataTable === 'undefined' || !window.DataTable) {
		render_fallback_table($tablePreview, columns, data);
	} else {
		new DataTable($tablePreview.get(0), {
			data: data,
			columns: columns,
			layout: columns.length < 10 ? 'fluid' : 'fixed',
			cellHeight: 35,
			serialNoColumn: false,
			checkboxColumn: false,
			noDataMessage: __('No Data'),
			disableReorderColumn: true,
		});
	}

	if (preview.max_rows_exceeded) {
		$wrapper.find('.table-message').text(
			__('Showing only first {0} rows out of {1}', [preview.max_rows_in_preview, preview.total_rows])
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


// ---------------- Map Columns (Autocomplete بسطرين: Label + fieldname) ----------------

function open_map_columns_dialog(frm) {
	if (!frm.doc.client_site || !frm.doc.target_doctype) {
		frappe.msgprint(__('Select the Client and Document Type first'));
		return;
	}
	get_target_fields_cached(frm, function (fields) {
		var options = [{ label: __("Don't Import"), value: "Don't Import" }].concat(
			fields.map(function (f) {
				return { label: (f.reqd ? '* ' : '') + f.label, description: f.fieldname, value: f.fieldname };
			})
		);

		var mappingRows = frm.doc.field_mapping || [];
		var fileLabel = frm.doc.source_file ? frm.doc.source_file.split('/').pop() : 'Google Sheet';

		var dialogFields = [
			{
				fieldtype: 'HTML', fieldname: 'heading',
				options: '<div class="text-muted">' + __('Map columns from {0} to fields in {1}', [
					'<b>' + frappe.utils.escape_html(fileLabel) + '</b>',
					'<b>' + frappe.utils.escape_html(frm.doc.target_doctype) + '</b>',
				]) + '</div>',
			},
			{ fieldtype: 'Section Break' },
		];

		mappingRows.forEach(function (row, i) {
			dialogFields.push({ fieldtype: 'Column Break' });
			dialogFields.push({ fieldtype: 'Data', fieldname: 'label_' + i, label: '', read_only: 1, default: row.source_column });
			dialogFields.push({ fieldtype: 'Column Break' });
			dialogFields.push({
				fieldtype: 'Autocomplete', fieldname: 'col_' + i, label: '',
				options: options, default: row.target_fieldname || "Don't Import",
			});
			dialogFields.push({ fieldtype: 'Section Break' });
		});

		var d = new frappe.ui.Dialog({
			title: __('Map Columns'),
			fields: dialogFields,
			size: 'large',
			primary_action_label: __('Submit'),
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
		d.show();
	});
}


// ---------------- Import Log ----------------

function render_import_log(frm) {
	var $wrapper = frm.fields_dict.import_log && $(frm.fields_dict.import_log.wrapper);
	if (!$wrapper) return;
	$wrapper.empty();

	if (!['Completed', 'Partially Failed', 'Failed'].includes(frm.doc.status)) return;

	var log = [];
	if (frm.doc.import_log) {
		try { log = JSON.parse(frm.doc.import_log) || []; } catch (e) { log = []; }
	}

	var success = frm.doc.success_count || 0;
	var failed = frm.doc.failed_count || 0;

	var $box = $('<div></div>');
	var $summary = $(
		'<div style="margin-bottom:10px">' +
		'<span class="indicator green">' + __('{0} succeeded', [success]) + '</span>' +
		'&nbsp;&nbsp;' +
		'<span class="indicator red">' + __('{0} failed', [failed]) + '</span>' +
		'</div>'
	);
	$box.append($summary);

	if (!log.length) {
		$wrapper.append($box);
		return;
	}

	var $checkboxRow = $(
		'<div class="checkbox" style="margin-bottom:10px">' +
		'<label><input type="checkbox" class="ai-import-only-failed" checked> ' + __('Show Only Failed Logs') + '</label>' +
		'</div>'
	);
	$box.append($checkboxRow);

	var $tableWrap = $('<div class="ai-import-log-table"></div>');
	$box.append($tableWrap);

	function draw() {
		$tableWrap.empty();
		var $table = $(
			'<table class="table table-bordered" style="font-size:12px">' +
			'<thead><tr><th style="width:90px">' + __('Row Number') + '</th><th style="width:100px">' + __('Status') + '</th><th>' + __('Message') + '</th></tr></thead>' +
			'<tbody></tbody></table>'
		);
		var $tbody = $table.find('tbody');
		log.forEach(function (entry) {
			var $tr = $('<tr></tr>');
			$tr.append('<td>' + entry.row + '</td>');
			$tr.append('<td><span class="indicator red">' + __('Failure') + '</span></td>');
			var $msgCell = $('<td></td>');
			$msgCell.append('<div><b>' + frappe.utils.escape_html(entry.title || '') + '</b></div>');
			$msgCell.append('<div class="text-muted">' + frappe.utils.escape_html(entry.detail || '') + '</div>');
			if (entry.traceback) {
				var $tbBtn = $('<button class="btn btn-xs btn-default" style="margin-top:4px">' + __('Show Traceback') + '</button>');
				$tbBtn.on('click', function () {
					frappe.msgprint({
						title: __('Traceback — Row {0}', [entry.row]),
						message: '<pre style="white-space:pre-wrap;font-size:11px">' + frappe.utils.escape_html(entry.traceback) + '</pre>',
					});
				});
				$msgCell.append($tbBtn);
			}
			$tr.append($msgCell);
			$tbody.append($tr);
		});
		$tableWrap.append($table);
	}

	draw();

	$checkboxRow.find('.ai-import-only-failed').on('change', function () {
		// كل السطور المخزّنة أصلًا فاشلة (النجاح لا يُسجَّل صفًا صفًا لتفادي تضخم القاعدة) —
		// إلغاء التفعيل هنا يخفي الجدول ويبقي فقط الملخص أعلاه
		if ($(this).is(':checked')) {
			$tableWrap.show();
		} else {
			$tableWrap.hide();
		}
	});

	$wrapper.append($box);
}
