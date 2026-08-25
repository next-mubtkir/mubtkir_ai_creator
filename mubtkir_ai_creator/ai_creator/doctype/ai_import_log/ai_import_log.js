frappe.ui.form.on('AI Import Log', {
    refresh: function(frm) {
        if (window.mubtkir && mubtkir.renderJsonField) {
            mubtkir.renderJsonField(frm, 'errors', { type: 'error_list' });
        }
    },
});
