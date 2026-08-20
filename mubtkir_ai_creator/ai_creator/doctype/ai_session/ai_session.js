frappe.ui.form.on('AI Session', {
    refresh: function(frm) {
        // Render messages as readable conversation instead of raw JSON
        if (frm.doc.messages && frm.doc.messages !== '[]') {
            const wrapper = frm.fields_dict.messages;
            if (!wrapper || !wrapper.$wrapper) return;

            try {
                const msgs = JSON.parse(frm.doc.messages);
                if (!msgs.length) return;

                // Hide raw JSON
                wrapper.$wrapper.find('.like-disabled-input, .control-value, .ace_editor, .ace-container').hide();
                wrapper.$wrapper.find('.mubtkir-rendered').remove();

                const html = msgs.map(m => {
                    const role = m.role === 'user' ? 'User' : 'Bot';
                    const color = m.role === 'user' ? 'var(--blue-500)' : 'var(--green-600)';
                    const bg = m.role === 'user' ? 'var(--blue-50)' : 'var(--green-50)';
                    let text = '';
                    if (typeof m.content === 'string') {
                        text = m.content;
                    } else if (Array.isArray(m.content)) {
                        text = m.content.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
                        const tools = m.content.filter(b => b.type === 'tool_use');
                        if (tools.length) text += '\n[Tools: ' + tools.map(t => t.name).join(', ') + ']';
                    }
                    if (!text) return '';
                    return `<div style="padding:10px 14px;margin:4px 0;border-radius:8px;background:${bg};border-left:3px solid ${color}">
                        <div style="font-size:11px;font-weight:600;color:${color};margin-bottom:4px">${role}</div>
                        <div style="font-size:13px;white-space:pre-wrap;word-break:break-word">${frappe.utils.escape_html(text.substring(0, 1000))}${text.length > 1000 ? '...' : ''}</div>
                    </div>`;
                }).filter(Boolean).join('');

                wrapper.$wrapper.append(`<div class="mubtkir-rendered" style="max-height:500px;overflow-y:auto">${html}</div>`);
            } catch(e) { /* leave raw */ }
        }
    },
});
