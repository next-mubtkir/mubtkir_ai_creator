frappe.ui.form.on('AI Deployment', {
	refresh: function (frm) {
		setup_doctype_suggestions(frm);
		if (frm.is_new()) return;

		// Render JSON fields as readable UI
		if (window.mubtkir && mubtkir.renderJsonField) {
			mubtkir.renderJsonField(frm, 'resolved_payload', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'manual_payload', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'preview_summary', { type: 'key_value' });
		}

		var st = frm.doc.status;

		// ===== Browse Available =====
		if (['Draft', 'Previewed', 'Pending Approval'].includes(st) && frm.doc.source_mode === 'Copy from Client') {
			frm.add_custom_button(__('Browse Available'), function () {
				if (!frm.doc.source_client || !frm.doc.deployment_type) {
					frappe.msgprint('Select source client and deployment type first');
					return;
				}
				var d = new frappe.ui.Dialog({
					title: __('استعراض العناصر المتاحة لدى العميل المصدر'),
					fields: [{ fieldname: 'results', fieldtype: 'HTML' }],
				});
				frappe.call({
					method: 'mubtkir_ai_creator.lib.templates.run_list_available',
					args: { client_site: frm.doc.source_client, artifact_type: frm.doc.deployment_type },
					freeze: true,
					callback: function (r) {
						var rows = r.message || [];
						if (!rows.length) {
							d.fields_dict.results.$wrapper.html('<div >لا توجد عناصر من هذا النوع</div>');
							d.show();
							return;
						}
						var $list = $('<div  style="max-height:320px;overflow:auto;"></div>');
						rows.forEach(function (row) {
							var $item = $('<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);"><span>' + frappe.utils.escape_html(row.name) + '</span><button class="btn btn-xs btn-default">تحديد</button></div>');
							$item.find('button').on('click', function () {
								frm.set_value('source_record', row.name);
								d.hide();
							});
							$list.append($item);
						});
						d.fields_dict.results.$wrapper.empty().append($list);
						d.show();
					},
				});
			});
		}

		// ===== Select All Clients =====
		if (['Draft', 'Previewed', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('Select All Clients'), function () {
				frappe.call({
					method: 'frappe.client.get_list',
					args: { doctype: 'AI Client Site', filters: { is_active: 1 }, fields: ['name'], limit_page_length: 500 },
					callback: function (r) {
						var existing = {};
						(frm.doc.targets || []).forEach(function (t) { existing[t.client_site] = 1; });
						(r.message || []).forEach(function (c) {
							if (c.name === frm.doc.source_client || existing[c.name]) return;
							var row = frm.add_child('targets');
							row.client_site = c.name;
						});
						frm.refresh_field('targets');
						frappe.show_alert({ message: __('تمت إضافة كل العملاء المفعّلين'), indicator: 'green' }, 4);
					},
				});
			}, __('Targets'));
		}

		// ===== Check Compatibility =====
		if (['Draft', 'Previewed', 'Pending Approval'].includes(st)) {
			frm.add_custom_button(__('Check Compatibility'), function () {
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
							message: '<div ><b>' + frappe.utils.escape_html((r.message || {}).summary || '') + '</b><br><br>Review Targets table for details before approval.</div>',
						});
					},
					error: function () { frappe.dom.unfreeze(); },
				});
			}).addClass('btn-primary');
		}

		// ===== Approve & Execute =====
		if (st === 'Pending Approval') {
			frm.add_custom_button(__('Approve & Execute'), function () {
				var bad = 0, warn = 0;
				(frm.doc.targets || []).forEach(function (t) {
					if (t.compatibility === 'Incompatible') bad++;
					if (t.compatibility === 'Warning') warn++;
				});
				frappe.confirm(
					'Will deploy to <b>' + (frm.doc.targets || []).length + '</b> clients.<br>Incompatible: <b>' + bad + '</b> — Warnings: <b>' + warn + '</b><br><br>Incompatible clients will be marked Failed without stopping others.<br><b>Continue?</b>',
					function () {
						frappe.dom.freeze('Deploying to clients...');
						frappe.call({
							method: 'mubtkir_ai_creator.ai_creator.doctype.ai_deployment.ai_deployment.approve_and_execute',
							args: { name: frm.doc.name },
							callback: function (r) {
								frappe.dom.unfreeze();
								frm.reload_doc();
								var o = r.message || {};
								frappe.msgprint({
									title: 'Deployment Complete',
									indicator: o.failed ? 'orange' : 'green',
									message: 'Succeeded: <b>' + (o.success||0) + '</b> — Failed: <b>' + (o.failed||0) + '</b> — Skipped: <b>' + (o.skipped||0) + '</b>',
								});
							},
							error: function () { frappe.dom.unfreeze(); },
						});
					}
				);
			}).addClass('btn-danger');
		}

		// ===== Copy Results Report =====
		if (['Completed', 'Partially Failed', 'Failed'].includes(st)) {
			frm.add_custom_button(__('Copy Results Report'), function () {
				var lines = [
					'عملية النشر: ' + frm.doc.name + ' — ' + (frm.doc.title || ''),
					'النوع: ' + frm.doc.deployment_type,
					'الحالة: ' + frm.doc.status,
					'Succeeded: ' + frm.doc.success_count + ' | Failed: ' + frm.doc.failed_count + ' | تُخطّي: ' + frm.doc.skipped_count,
					'', '--- تفاصيل كل عميل ---',
				];
				(frm.doc.targets || []).forEach(function (t) {
					lines.push(t.client_site + ': ' + t.status + ' — ' + (t.result || ''));
				});
				frappe.utils.copy_to_clipboard(lines.join('\n'));
				frappe.show_alert({ message: __('تم نسخ التقرير'), indicator: 'green' }, 3);
			});
		}

		// ===== شريط حالة =====
		if (frm.doc.preview_summary) {
			var colors = { Completed: 'green', 'Partially Failed': 'orange', Failed: 'red', Executing: 'blue', 'Pending Approval': 'orange', Previewed: 'blue', Draft: 'grey' };
			frm.dashboard.set_headline_alert('<span class="indicator ' + (colors[st] || 'grey') + '">' + frappe.utils.escape_html(frm.doc.preview_summary) + '</span>');
		}
	},

	deployment_type: function (frm) {
		var hints = {
			'Print Format': 'اسم الـ Print Format لدى العميل المصدر',
			'Custom Field': 'اسم Custom Field لدى المصدر (مثل: Sales Invoice-contract_no)',
			'Settings': 'اسم DocType الإعدادات (مثل: Stock Settings)',
			'Custom HTML Block': 'اسم الـ Custom HTML Block لدى العميل المصدر',
			'Workspace': 'اسم الـ Workspace لدى العميل المصدر',
			'Item': 'كود الصنف (item_code) لدى العميل المصدر',
			'Customer': 'اسم العميل (Customer) لدى العميل المصدر',
			'Supplier': 'اسم المورد (Supplier) لدى العميل المصدر',
		};
		frm.set_df_property('source_record', 'description', hints[frm.doc.deployment_type] || 'اسم العنصر لدى العميل المصدر');
		frm.refresh_field('source_record');
	},

	source_client: function (frm) {
		setup_doctype_suggestions(frm);
	},
});

function setup_doctype_suggestions(frm) {
	if (!frm.doc.source_client) return;
	frappe.call({
		method: 'mubtkir_ai_creator.ai_creator.doctype.ai_deployment.ai_deployment.get_client_doctypes',
		args: { client_site: frm.doc.source_client },
		async: false,
		callback: function (r) {
			var list = r.message || [];
			// target_doctype — حقل Data عادي + awesomplete للاقتراحات
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
