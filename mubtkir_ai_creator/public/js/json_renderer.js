/**
 * Mubtkir AI Creator — JSON Field Renderer
 * Replaces ALL raw JSON/Code fields with human-readable formatted displays.
 * Handles: Code, Small Text, Long Text, Text, JSON fieldtypes.
 */
window.mubtkir = window.mubtkir || {};

mubtkir.renderJsonField = function(frm, fieldname, options) {
    options = options || {};
    const wrapper = frm.fields_dict[fieldname];
    if (!wrapper || !wrapper.$wrapper) return;

    const raw = frm.doc[fieldname];
    if (!raw || raw === '[]' || raw === '{}' || raw === 'null') {
        wrapper.$wrapper.find('.mubtkir-rendered').remove();
        if (options.hideEmpty !== false) {
            _hideRaw(wrapper.$wrapper);
            wrapper.$wrapper.append('<div class="mubtkir-rendered text-muted" style="padding:8px 0;font-size:13px">No data</div>');
        }
        return;
    }

    let data;
    try { data = JSON.parse(raw); } catch(e) { return; }

    _hideRaw(wrapper.$wrapper);
    wrapper.$wrapper.find('.mubtkir-rendered').remove();

    let html;
    if (options.type === 'error_list') html = _renderErrorList(data, options);
    else if (options.type === 'key_value') html = _renderKV(data, options);
    else if (options.type === 'mapping') html = _renderMapping(data, options);
    else if (Array.isArray(data)) html = _renderArray(data, options);
    else if (typeof data === 'object') html = _renderKV(data, options);
    else html = `<div style="padding:8px 0;font-size:13px">${_esc(String(data))}</div>`;

    wrapper.$wrapper.append(`<div class="mubtkir-rendered">${html}</div>`);
};

function _hideRaw($w) {
    // Hide ALL possible raw display elements (Code, Small Text, Long Text, Text, JSON)
    $w.find('.like-disabled-input, .control-value, .ql-editor, .ace_editor, .ace-container, .input-with-feedback, textarea').each(function() {
        const $el = $(this);
        if (!$el.closest('.mubtkir-rendered').length) $el.hide();
    });
}

function _esc(s) { return frappe.utils.escape_html(s); }

function _smartVal(key, val) {
    if (val === null || val === undefined || val === '') return '<span class="text-muted">—</span>';
    const k = (key || '').toLowerCase();
    // Large code/HTML/content fields → summary
    if (['html','script','css','content','code','json','style'].includes(k) && typeof val === 'string' && val.length > 100) {
        return `<span class="text-muted">[${k} — ${val.length.toLocaleString()} chars]</span>`;
    }
    if (typeof val === 'object') {
        if (Array.isArray(val)) {
            if (!val.length) return '<span class="text-muted">[]</span>';
            return `<span class="text-muted">[${val.length} items]</span>`;
        }
        const json = JSON.stringify(val);
        if (json.length > 150) return `<span class="text-muted">[object — ${Object.keys(val).length} fields]</span>`;
        // Small object — show key:value inline
        return _esc(Object.entries(val).map(([k,v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', '));
    }
    const s = String(val);
    if (s.length > 250) return _esc(s.substring(0, 250)) + `<span class="text-muted">… [${s.length.toLocaleString()} chars]</span>`;
    return _esc(s);
}

// ─── Error list ───
function _renderErrorList(data, opts) {
    if (!Array.isArray(data) || !data.length) return '<div class="text-muted" style="padding:8px 0">No errors</div>';
    const rows = data.slice(0, opts.limit || 100).map(e => {
        const msg = _extractErr(e.error || e.message || e.msg || '');
        return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:8px 12px;color:var(--red-500);font-weight:600;white-space:nowrap;vertical-align:top">Row ${e.row || '?'}</td>
            <td style="padding:8px 12px;font-size:13px">${_esc(msg)}</td>
        </tr>`;
    }).join('');
    return `<div style="max-height:350px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-light-gray)"><th style="padding:8px 12px;text-align:left;font-size:12px">Row</th><th style="padding:8px 12px;text-align:left;font-size:12px">Error</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
    <div class="text-muted" style="font-size:11px;margin-top:4px">${data.length} error(s)</div>`;
}

// ─── Key-value ───
function _renderKV(data, opts) {
    if (!data || typeof data !== 'object') return '';
    const skip = new Set(['doctype','docstatus','owner','modified_by','creation','modified','__islocal','__unsaved','_comments','_liked_by','_assign','idx','parent','parenttype','parentfield','name1']);
    const entries = Object.entries(data).filter(([k]) => !skip.has(k) && !k.startsWith('_'));
    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">Empty</div>';
    const rows = entries.map(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:6px 12px;font-weight:600;font-size:13px;white-space:nowrap;vertical-align:top;color:var(--heading-color)">${_esc(label)}</td>
            <td style="padding:6px 12px;font-size:13px;word-break:break-word">${_smartVal(key, val)}</td>
        </tr>`;
    }).join('');
    return `<div style="border:1px solid var(--border-color);border-radius:8px;max-height:400px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
}

// ─── Mapping ───
function _renderMapping(data, opts) {
    if (!data || typeof data !== 'object') return '';
    const entries = Object.entries(data);
    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">No mapping</div>';
    const rows = entries.map(([src, target]) =>
        `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:6px 12px;font-weight:600;font-size:13px">${_esc(src)}</td>
            <td style="padding:6px 12px;text-align:center;color:var(--text-muted)">→</td>
            <td style="padding:6px 12px;font-size:13px">${target ? _esc(target) : '<span class="text-muted">— Skip —</span>'}</td>
        </tr>`
    ).join('');
    return `<div style="border:1px solid var(--border-color);border-radius:8px;max-height:300px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-light-gray)"><th style="padding:6px 12px;text-align:left;font-size:12px">File Column</th><th style="width:30px"></th><th style="padding:6px 12px;text-align:left;font-size:12px">Target Field</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
}

// ─── Array ───
function _renderArray(data, opts) {
    if (!data.length) return '<div class="text-muted" style="padding:8px 0">Empty list</div>';
    if (data[0] && data[0].row !== undefined && (data[0].error || data[0].message)) return _renderErrorList(data, opts);
    const keys = [...new Set(data.flatMap(d => typeof d === 'object' && d ? Object.keys(d) : []))].filter(k => !k.startsWith('_'));
    if (!keys.length) return `<div style="padding:8px 0;font-size:13px">${data.length} item(s)</div>`;
    const thead = keys.map(k => `<th style="padding:6px 10px;text-align:left;font-size:12px">${_esc(k.replace(/_/g,' '))}</th>`).join('');
    const tbody = data.slice(0, opts.limit || 50).map(row => {
        const cells = keys.map(k => `<td style="padding:6px 10px;font-size:12px">${typeof row === 'object' && row ? _smartVal(k, row[k]) : _esc(String(row))}</td>`).join('');
        return `<tr style="border-bottom:1px solid var(--border-color)">${cells}</tr>`;
    }).join('');
    return `<div style="border:1px solid var(--border-color);border-radius:8px;max-height:400px;overflow:auto">
        <table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg-light-gray)">${thead}</tr></thead><tbody>${tbody}</tbody></table></div>
    ${data.length > (opts.limit||50) ? `<div class="text-muted" style="font-size:11px;margin-top:4px">Showing ${opts.limit||50} of ${data.length}</div>` : ''}`;
}

// ─── Error message extractor ───
function _extractErr(raw) {
    if (!raw) return 'Unknown error';
    var translations = {
        '1292': 'Incorrect date/time/number format — check field type',
        '1062': 'Duplicate entry — record already exists',
        '1048': 'Required field is empty (NOT NULL)',
        '1452': 'Invalid link — referenced record not found',
        '1406': 'Value too long for field',
        '1264': 'Value out of range for field',
        '1054': 'Unknown column — field does not exist',
        '1146': 'Table does not exist — DocType may not be installed',
    };
    try {
        // Decode unicode escapes first
        var decoded = raw;
        if (raw.includes('\\u0')) { try { decoded = JSON.parse('"' + raw.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'); } catch(e) {} }
        // _server_messages
        var m = decoded.match(/"message"\s*:\s*"([^"]+)"/);
        if (m) return m[1];
        // ValidationError / LinkValidationError
        m = decoded.match(/(?:Validation|LinkValidation)Error:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
        // OperationalError — match even truncated errors like "OperationalError: (1292, \"
        m = decoded.match(/OperationalError[:\s]*\((\d+)/);
        if (m) {
            var code = m[1];
            // Try to extract the problematic value
            var valMatch = decoded.match(/'([^']{1,80})'/);
            var detail = valMatch ? ' (value: ' + valMatch[1] + ')' : '';
            return (translations[code] || 'Database error (' + code + ')') + detail;
        }
        // Generic exception
        m = decoded.match(/"exception"\s*:\s*"[^:]+:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
    } catch(e) {}
    return raw.replace(/https?:\/\/[^\s,}"]+/g, '').replace(/\\n/g, ' ').replace(/\\"/g, '"').substring(0, 300);
}
