frappe.ui.form.on('AI Task', {
    refresh: function(frm) {
        // Render JSON fields as formatted tables
        _withRenderer(function() {
            mubtkir.renderJsonField(frm, 'planned_calls');
            mubtkir.renderJsonField(frm, 'execution_result');
            mubtkir.renderJsonField(frm, 'verification_result');
        });

        // Chat Output tab — show raw JSON as it appears in chat (both before and after execution)
        _renderChatTab(frm);

        // Error headline
        if (frm.doc.error_message) {
            var clean = frm.doc.error_message
                .replace(/\\u([0-9a-fA-F]{4})/g, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
                .replace(/https?:\/\/[^\s,}"]+/g, '')
                .replace(/\\n/g, ' ')
                .substring(0, 500);
            frm.dashboard.add_comment('<b>Error:</b> ' + frappe.utils.escape_html(clean), 'red', true);
        }
    },
});

function _renderChatTab(frm) {
    var wrapper = frm.fields_dict.chat_output_html;
    if (!wrapper || !wrapper.$wrapper) return;

    var parts = [];

    // Before execution — planned tool calls (the JSON shown in the approval box in chat)
    if (frm.doc.planned_calls && frm.doc.planned_calls !== '[]') {
        try {
            var calls = JSON.parse(frm.doc.planned_calls);
            var pretty = JSON.stringify(calls, null, 2);
            parts.push(
                '<div style="margin-bottom:16px">'
                + '<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--heading-color)">Before Execution — Planned Calls</div>'
                + '<div style="background:var(--bg-light-gray,#f8f9fa);border:1px solid var(--border-color);border-radius:8px;padding:12px;max-height:350px;overflow:auto;direction:ltr;text-align:left">'
                + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;font-family:monospace">'
                + frappe.utils.escape_html(pretty)
                + '</pre></div></div>'
            );
        } catch(e) {}
    }

    // After execution — verification result (the JSON shown after approval in chat)
    if (frm.doc.verification_result && frm.doc.verification_result !== '[]' && frm.doc.verification_result !== '{}') {
        try {
            var verif = JSON.parse(frm.doc.verification_result);
            var prettyV = JSON.stringify(verif, null, 2);
            parts.push(
                '<div>'
                + '<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--heading-color)">After Execution — Verification Result</div>'
                + '<div style="background:var(--bg-light-gray,#f8f9fa);border:1px solid var(--border-color);border-radius:8px;padding:12px;max-height:350px;overflow:auto;direction:ltr;text-align:left">'
                + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;font-family:monospace">'
                + frappe.utils.escape_html(prettyV)
                + '</pre></div></div>'
            );
        } catch(e) {}
    }

    if (!parts.length) {
        wrapper.$wrapper.html('<div class="text-muted" style="padding:12px;font-size:13px">No chat output yet</div>');
    } else {
        wrapper.$wrapper.html(parts.join(''));
    }
}

function _withRenderer(fn) {
    if (window.mubtkir && mubtkir.renderJsonField) { fn(); return; }
    var tries = 0;
    var iv = setInterval(function() {
        if (window.mubtkir && mubtkir.renderJsonField) { clearInterval(iv); fn(); }
        if (++tries > 30) clearInterval(iv);
    }, 100);
}
