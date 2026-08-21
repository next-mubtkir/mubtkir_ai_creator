frappe.ui.form.on('AI Import Mapping', {
    refresh: function(frm) {
        _withRenderer(function() {
            mubtkir.renderJsonField(frm, 'mapping_data', { type: 'mapping' });
        });
    },
});

function _withRenderer(fn) {
    if (window.mubtkir && mubtkir.renderJsonField) { fn(); return; }
    var tries = 0;
    var iv = setInterval(function() {
        if (window.mubtkir && mubtkir.renderJsonField) { clearInterval(iv); fn(); }
        if (++tries > 30) clearInterval(iv);
    }, 100);
}
