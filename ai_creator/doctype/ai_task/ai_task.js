frappe.ui.form.on('AI Task', {
    refresh: function(frm) {
        _withRenderer(function() {
            mubtkir.renderJsonField(frm, 'planned_calls');
            mubtkir.renderJsonField(frm, 'execution_result');
            mubtkir.renderJsonField(frm, 'verification_result');
        });

        // Show chat_output as-is (raw formatted JSON like in chat)
        _renderChatOutput(frm);

        if (frm.doc.error_message) {
            const clean = frm.doc.error_message
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                .replace(/https?:\/\/[^\s,}"]+/g, '')
                .replace(/\\n/g, ' ')
                .substring(0, 500);
            frm.dashboard.add_comment('<b>Error:</b> ' + frappe.utils.escape_html(clean), 'red', true);
        }
    },
});

function _renderChatOutput(frm) {
    const wrapper = frm.fields_dict.chat_output;
    if (!wrapper || !wrapper.$wrapper) return;
    const raw = frm.doc.chat_output;
    if (!raw) {
        wrapper.$wrapper.find('.mc-chat-out').remove();
        return;
    }
    // Hide the raw Code field display
    wrapper.$wrapper.find('.like-disabled-input, .control-value, .ace_editor, .ace-container, textarea').each(function() {
        if (!$(this).closest('.mc-chat-out').length) $(this).hide();
    });
    wrapper.$wrapper.find('.mc-chat-out').remove();
    wrapper.$wrapper.append(
        '<div class="mc-chat-out" style="background:var(--bg-light-gray,#f8f9fa);border:1px solid var(--border-color);border-radius:8px;padding:12px;max-height:400px;overflow:auto;direction:ltr;text-align:left">'
        + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;font-family:monospace">'
        + frappe.utils.escape_html(raw)
        + '</pre></div>'
    );
}

function _withRenderer(fn) {
    if (window.mubtkir && mubtkir.renderJsonField) { fn(); return; }
    var tries = 0;
    var iv = setInterval(function() {
        if (window.mubtkir && mubtkir.renderJsonField) { clearInterval(iv); fn(); }
        if (++tries > 30) clearInterval(iv);
    }, 100);
}
