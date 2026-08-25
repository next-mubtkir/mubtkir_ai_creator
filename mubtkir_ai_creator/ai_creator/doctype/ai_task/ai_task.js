frappe.ui.form.on('AI Task', {
    refresh: function(frm) {
        if (window.mubtkir && mubtkir.renderJsonField) {
            mubtkir.renderJsonField(frm, 'planned_calls');
            mubtkir.renderJsonField(frm, 'execution_result', { type: 'key_value' });
            mubtkir.renderJsonField(frm, 'verification_result', { type: 'key_value' });
        }
        if (frm.doc.error_message) {
            const clean = frm.doc.error_message.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/https?:\/\/[^\s,}"]+/g, '').replace(/\\n/g, ' ').substring(0, 500);
            frm.dashboard.add_comment('<b>Error:</b> ' + frappe.utils.escape_html(clean), 'red', true);
        }
    },
});
