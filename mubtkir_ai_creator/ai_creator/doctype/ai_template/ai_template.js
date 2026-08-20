frappe.ui.form.on('AI Template', {
    refresh: function(frm) {
        if (window.mubtkir && mubtkir.renderJsonField) {
            mubtkir.renderJsonField(frm, 'payload', { type: 'key_value' });
        }

        if (frm.is_new()) return;
        if (frm.doc.deployable && ['Print Format', 'Custom Field'].includes(frm.doc.artifact_type)) {
            frm.add_custom_button('Create Bulk Deployment', function () {
                frappe.new_doc('AI Deployment', {
                    source_mode: 'From Template',
                    template: frm.doc.name,
                    deployment_type: frm.doc.artifact_type,
                    source_record: frm.doc.source_record,
                    target_doctype: frm.doc.target_doctype,
                });
            }).addClass('btn-primary');
        }
    },
});
