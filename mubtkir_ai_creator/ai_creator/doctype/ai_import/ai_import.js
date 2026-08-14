frappe.ui.form.on('AI Import', {
	refresh: function (frm) {
		load_target_doctype_options(frm);
		if (frm.is_new()) return;
		render_steps(frm);
		render_errors_and_preview(frm);
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
		callback: function (r) {
			frm.set_df_property('target_doctype', 'options', r.message || []);
			frm.refresh_field('target_doctype');
		},
	});
}

// خطوات التنفيذ الثلاث معروضة كقائمة مرقّمة واحدة بمكان ثابت، بدل أزرار متفرقة بالشريط العلوي
function render_steps(frm) {
	const st = frm.doc.status;
	const steps = [
		{
			key: 'analyze',
			label: __('١. تحليل الملف'),
			active: ['Draft', 'Mapping Ready'].includes(st) && !!frm.doc.source_file,
			done: !['Draft'].includes(st),
			run: () => run_analyze(frm),
		},
		{
			key: 'preview',
			label: __('٢. معاينة'),
			active: ['Mapping Ready', 'Pending Approval'].includes(st),
			done: ['Pending Approval', 'Approved', 'Queued', 'Executing', 'Completed', 'Partially Failed', 'Failed'].includes(st),
			run: () => run_preview_step(frm),
		},
		{
			key: 'execute',
			label: __('٣. اعتماد وتنفيذ'),
			active: st === 'Pending Approval',
			done: ['Approved', 'Queued', 'Executing', 'Completed', 'Partially Failed', 'Failed'].includes(st),
			run: () => run_execute(frm),
		},
	];

	const $wrap = $('<div class="ai-import-steps" dir="rtl" style="display:flex;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg,#fafbfc)"></div>');
	steps.forEach((s) => {
		const color = s.done ? '#2ca87f' : s.active ? 'var(--primary)' : '#94a3b8';
		const $btn = $(`
			<button class="btn btn-sm" style="border:1px solid ${color};color:${s.active ? '#fff' : color};background:${s.active ? color : 'transparent'};flex:1" ${s.active ? '' : 'disabled'}>
				${s.done ? '✓ ' : ''}${s.label}
			</button>
		`);
		if (s.active) $btn.on('click', s.run);
		$wrap.append($btn);
	});

	frm.dashboard.wrapper.find('.ai-import-steps').remove();
	frm.dashboard.wrapper.prepend($wrap);

	// متابعة التقدّم أثناء التنفيذ الخلفي — نبض واضح كل ثانيتين بدل قفزة كل 5 ثوانٍ
	frm.dashboard.wrapper.find('.ai-import-progress').remove();
	if (['Queued', 'Executing'].includes(st)) {
		const total = frm.doc.total_rows || 1;
		const done = frm.doc.processed_rows || 0;
		const pct = ((done / total) * 100).toFixed(0);
		const $prog = $(`
			<div class="ai-import-progress" dir="rtl" style="margin:0 0 10px">
				<div style="font-size:12px;color:#64748b;margin-bottom:4px">
					<span class="ai-import-spinner">⏳</span> ${__('جارٍ التنفيذ')}: ${done} / ${total}
				</div>
				<div style="height:8px;border-radius:4px;background:#e5e9f0;overflow:hidden">
					<div style="height:100%;width:${pct}%;background:var(--primary);transition:width .4s;background-image:linear-gradient(45deg,rgba(255,255,255,.2) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.2) 50%,rgba(255,255,255,.2) 75%,transparent 75%,transparent);background-size:16px 16px;animation:ai-import-stripes 1s linear infinite"></div>
				</div>
			</div>
		`);
		frm.dashboard.wrapper.find('.ai-import-steps').after($prog);
		if (!$('#ai-import-stripes-style').length) {
			$('head').append('<style id="ai-import-stripes-style">@keyframes ai-import-stripes{0%{background-position:0 0}100%{background-position:16px 0}}</style>');
		}
		setTimeout(() => frm.reload_doc(), 2000);
	}

	if (['Completed', 'Partially Failed', 'Failed'].includes(st) && (frm.doc.failure_report || frm.doc.invalid_rows)) {
		frm.add_custom_button(__('نسخ تقرير الفشل'), function () {
			frappe.utils.copy_to_clipboard(frm.doc.failure_report || '');
			frappe.show_alert({ message: __('تم النسخ'), indicator: 'green' }, 3);
		});
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
}

// قسم "أخطاء وتحذيرات الملف" + قسم "المعاينة" بنفس أسلوب Data Import الأصلي بالنظام
function render_errors_and_preview(frm) {
	frm.dashboard.wrapper.find('.ai-import-errors, .ai-import-preview').remove();

	const mappingRows = frm.doc.field_mapping || [];
	if (!mappingRows.length) return;

	const unmatched = mappingRows.filter((r) => !r.target_fieldname);

	// --- Import File Errors and Warnings ---
	if (unmatched.length) {
		const $err = $(`<div class="ai-import-errors" dir="ltr" style="margin:0 0 14px"><h4>${__('Import File Errors and Warnings')}</h4></div>`);
		unmatched.forEach((r, i) => {
			$err.append(`
				<div style="margin:10px 0">
					<b>COLUMN ${i + 1}</b> (${frappe.utils.escape_html(r.source_column)})<br>
					<span style="color:#8d99a6">Cannot match column ${frappe.utils.escape_html(r.source_column)} with any field
					${r.sample_value ? ' — example: ' + frappe.utils.escape_html(r.sample_value) : ''}</span>
				</div>
			`);
		});
		frm.dashboard.wrapper.find('.ai-import-steps').after($err);
	}

	// --- Preview ---
	let sample = [];
	try {
		sample = JSON.parse(frm.doc.sample_rows || '[]');
	} catch (e) {
		sample = [];
	}
	if (!sample.length) return;

	const $prev = $(`<div class="ai-import-preview" dir="ltr" style="margin:0 0 14px"><h4>${__('Preview')}</h4></div>`);
	const $btns = $(`
		<div style="display:flex;gap:8px;margin-bottom:10px">
			<button class="btn btn-sm btn-default ai-map-columns">${__('Map Columns')}</button>
			<button class="btn btn-sm btn-default ai-show-warnings">${__('Show Warnings')}</button>
		</div>
	`);
	$prev.append($btns);

	const headers = mappingRows.map((r) => r.source_column);
	const $table = $('<div style="overflow-x:auto"><table class="table table-bordered" style="min-width:600px"></table></div>');
	const $t = $table.find('table');
	let thead = '<thead><tr><th>Sr.</th>';
	headers.forEach((h) => {
		const row = mappingRows.find((r) => r.source_column === h);
		const warn = row && !row.target_fieldname ? ' ⚠️' : '';
		thead += `<th>${frappe.utils.escape_html(h)}${warn}</th>`;
	});
	thead += '</tr></thead>';
	let tbody = '<tbody>';
	sample.forEach((row, i) => {
		tbody += `<tr><td>${i + 1}</td>`;
		headers.forEach((h) => {
			tbody += `<td>${frappe.utils.escape_html(String(row[h] ?? ''))}</td>`;
		});
		tbody += '</tr>';
	});
	tbody += '</tbody>';
	$t.html(thead + tbody);
	$prev.append($table);

	frm.dashboard.wrapper.find('.ai-import-errors').length
		? frm.dashboard.wrapper.find('.ai-import-errors').after($prev)
		: frm.dashboard.wrapper.find('.ai-import-steps').after($prev);

	$btns.find('.ai-map-columns').on('click', () => open_map_columns_dialog(frm));
	$btns.find('.ai-show-warnings').on('click', () => open_warnings_dialog(frm));
}

function open_map_columns_dialog(frm) {
	if (!frm.doc.target_doctype) {
		frappe.msgprint(__('حدد الـ DocType المستهدف أولًا'));
		return;
	}
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.get_target_fields',
		args: { client_site: frm.doc.client_site, target_doctype: frm.doc.target_doctype },
		freeze: true,
		callback: function (r) {
			const fields = r.message || [];
			const options = [''].concat(fields.map((f) => f.fieldname));
			const labels = { '': __('— تجاهل —') };
			fields.forEach((f) => (labels[f.fieldname] = `${f.label} (${f.fieldname})${f.reqd ? ' *' : ''}`));

			const d = new frappe.ui.Dialog({
				title: __('Map Columns'),
				fields: (frm.doc.field_mapping || []).map((r, i) => ({
					fieldname: `col_${i}`,
					label: r.source_column,
					fieldtype: 'Select',
					options: options.map((o) => (o === '' ? '' : o)).join('\n'),
					default: r.target_fieldname || '',
				})),
				primary_action_label: __('حفظ'),
				primary_action: function (values) {
					(frm.doc.field_mapping || []).forEach((row, i) => {
						row.target_fieldname = values[`col_${i}`] || '';
					});
					frm.dirty();
					frm.save().then(() => {
						d.hide();
						render_errors_and_preview(frm);
					});
				},
			});
			// عرض التسميات الودّية بدل fieldname الخام داخل كل Select
			d.fields_list.forEach((f, i) => {
				if (f.df.fieldtype !== 'Select') return;
				const $sel = f.$input;
				$sel.find('option').each(function () {
					const val = $(this).val();
					if (labels[val]) $(this).text(labels[val]);
				});
			});
			d.show();
		},
	});
}

function open_warnings_dialog(frm) {
	let parsed = {};
	try {
		parsed = JSON.parse(frm.doc.preview_result || '{}');
	} catch (e) {
		parsed = {};
	}
	const issues = parsed.row_issues || [];
	const d = new frappe.ui.Dialog({ title: __('Show Warnings'), size: 'large', fields: [{ fieldname: 'html', fieldtype: 'HTML' }] });
	if (!issues.length) {
		d.fields_dict.html.$wrapper.html(`<div dir="rtl">${__('لا توجد تحذيرات — سوِّ المعاينة أولًا إن لم تظهر نتيجة')}</div>`);
	} else {
		let html = `<div dir="rtl" style="max-height:400px;overflow:auto"><table class="table table-bordered"><thead><tr><th>${__('الصف')}</th><th>${__('المشاكل')}</th></tr></thead><tbody>`;
		issues.forEach((it) => {
			html += `<tr><td>${it.row}</td><td>${frappe.utils.escape_html((it.issues || []).join('، '))}</td></tr>`;
		});
		html += '</tbody></table></div>';
		d.fields_dict.html.$wrapper.html(html);
	}
	d.show();
}

function run_analyze(frm) {
	frappe.dom.freeze(__('جارٍ قراءة الملف وبناء خريطة الحقول...'));
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.analyze',
		args: { name: frm.doc.name },
		callback: function () {
			frappe.dom.unfreeze();
			frm.reload_doc();
		},
		error: () => frappe.dom.unfreeze(),
	});
}

function run_preview_step(frm) {
	frappe.dom.freeze(__('جارٍ فحص كل الصفوف...'));
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_import.ai_import.run_preview',
		args: { name: frm.doc.name },
		callback: function () {
			frappe.dom.unfreeze();
			frm.reload_doc();
		},
		error: () => frappe.dom.unfreeze(),
	});
}

function run_execute(frm) {
	frappe.confirm(
		`<div dir="rtl">${__('سيتم إنشاء')} <b>${frm.doc.valid_rows}</b> ${__('مستند في حساب')} <b>${frappe.utils.escape_html(
			frm.doc.client_site
		)}</b>.<br>
		${__('صفوف بها مشاكل')}: <b>${frm.doc.invalid_rows}</b> ${
			frm.doc.skip_invalid_rows ? '(' + __('ستُتخطّى') + ')' : '(' + __('سيتوقف الاستيراد عندها') + ')'
		}<br><br><b>${__('هل تريد المتابعة؟')}</b></div>`,
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
}
