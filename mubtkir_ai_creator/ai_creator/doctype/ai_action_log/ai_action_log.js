frappe.ui.form.on('AI Action Log', {
	refresh: function (frm) {
		// Render JSON fields as readable UI
		if (window.mubtkir && mubtkir.renderJsonField) {
			mubtkir.renderJsonField(frm, 'tool_input', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'tool_output', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'value_before', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'value_after', { type: 'key_value' });
			mubtkir.renderJsonField(frm, 'verification_result', { type: 'key_value' });
		}

		// Show error as readable headline
		if (frm.doc.error_message) {
			frm.dashboard.clear_headline();
			const cleanErr = frm.doc.error_message
				.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
				.replace(/https?:\/\/[^\s,}"]+/g, '')
				.replace(/\\n/g, ' ')
				.substring(0, 500);
			frm.dashboard.add_comment(`<b>Error:</b> ${frappe.utils.escape_html(cleanErr)}`, 'red', true);
		}

		// Undo button
		if (frm.doc.is_success && ['update_document', 'update_print_format', 'patch_print_format_html', 'patch_document_field'].includes(frm.doc.tool_name) && frm.doc.value_before) {
			frappe.call({
				method: 'mubtkir_ai_creator.lib.rollback.check_can_rollback',
				args: { log_name: frm.doc.name },
				callback: function (r) {
					if (!(r.message || {}).can_rollback) return;
					frm.add_custom_button('Undo This Change', function () {
						frappe.confirm(
							'This will restore the fields changed by this action on <b>' + frappe.utils.escape_html(frm.doc.client_site || '') + '</b>. This is a real operation on the client account. Continue?',
							function () {
								frappe.dom.freeze('Reverting...');
								frappe.call({
									method: 'mubtkir_ai_creator.lib.rollback.run_rollback',
									args: { log_name: frm.doc.name },
									callback: function (res) {
										frappe.dom.unfreeze();
										const m = res.message || {};
										frappe.show_alert({ message: 'Reverted: ' + (m.restored_fields || []).join(', '), indicator: 'green' }, 6);
										frm.reload_doc();
									},
									error: () => frappe.dom.unfreeze(),
								});
							}
						);
					}).addClass('btn-danger');
				},
			});
		}

		// Copy report button
		frm.add_custom_button('Copy Error Report', function () {
			const report = [
				'Log: ' + frm.doc.name,
				'Time: ' + (frm.doc.timestamp || ''),
				'Client: ' + (frm.doc.client_site || ''),
				'Tool: ' + (frm.doc.tool_name || ''),
				'Risk: ' + (frm.doc.risk_level || ''),
				'Success: ' + (frm.doc.is_success ? 'Yes' : 'No'),
				'Duration: ' + (frm.doc.duration_ms || 0) + 'ms',
				'',
				'--- Input ---',
				frm.doc.tool_input || '',
				'--- Error ---',
				frm.doc.error_message || '',
				'--- Output ---',
				frm.doc.tool_output || '',
			].join('\n');
			frappe.utils.copy_to_clipboard(report);
			frappe.show_alert({ message: 'Copied', indicator: 'green' }, 2);
		}).addClass('btn-primary');
	},
});
