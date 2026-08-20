frappe.ui.form.on('AI Import Mapping', {
    refresh: function(frm) {
        if (window.mubtkir && mubtkir.renderJsonField) {
            mubtkir.renderJsonField(frm, 'mapping_data', { type: 'mapping' });
        }
    },
});
