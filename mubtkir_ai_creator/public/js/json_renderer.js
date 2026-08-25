/**
 * Mubtkir AI Creator — JSON Field Renderer
 * Replaces raw JSON/Code fields with human-readable formatted displays.
 * Usage: mubtkir.renderJsonField(frm, 'field_name', options)
 */
window.mubtkir = window.mubtkir || {};

mubtkir.renderJsonField = function(frm, fieldname, options) {
    options = options || {};
    const wrapper = frm.fields_dict[fieldname];
    if (!wrapper || !wrapper.$wrapper) return;

    const raw = frm.doc[fieldname];
    if (!raw || raw === '[]' || raw === '{}' || raw === 'null') {
        // Show "No data" instead of empty JSON
        wrapper.$wrapper.find('.mubtkir-rendered').remove();
        if (options.hideEmpty !== false) {
            wrapper.$wrapper.find('.like-disabled-input, .control-value, .ql-editor').hide();
            wrapper.$wrapper.append('<div class="mubtkir-rendered text-muted" style="padding:8px 0;font-size:13px">No data</div>');
        }
        return;
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch(e) {
        return; // Not valid JSON, leave as-is
    }

    // Hide raw JSON
    wrapper.$wrapper.find('.like-disabled-input, .control-value, .ql-editor, .ace_editor, .ace-container').hide();
    wrapper.$wrapper.find('.mubtkir-rendered').remove();

    let html;
    if (options.type === 'error_list') {
        html = _renderErrorList(data, options);
    } else if (options.type === 'key_value') {
        html = _renderKeyValue(data, options);
    } else if (options.type === 'mapping') {
        html = _renderMapping(data, options);
    } else if (Array.isArray(data)) {
        html = _renderArray(data, options);
    } else if (typeof data === 'object') {
        html = _renderKeyValue(data, options);
    } else {
        html = `<div style="padding:8px 0;font-size:13px">${frappe.utils.escape_html(String(data))}</div>`;
    }

    wrapper.$wrapper.append(`<div class="mubtkir-rendered">${html}</div>`);
};

// ─── Error list: [{row: N, error: "..."}, ...] ───
function _renderErrorList(data, opts) {
    if (!Array.isArray(data) || !data.length) return '<div class="text-muted" style="padding:8px 0">No errors</div>';

    const rows = data.slice(0, opts.limit || 100).map(e => {
        const msg = _extractErrorMessage(e.error || e.message || e.msg || '');
        return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:8px 12px;color:var(--red-500);font-weight:600;white-space:nowrap;vertical-align:top">Row ${e.row || '?'}</td>
            <td style="padding:8px 12px;font-size:13px">${frappe.utils.escape_html(msg)}</td>
        </tr>`;
    }).join('');

    return `<div style="max-height:350px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--border-radius-lg)">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-light-gray)">
                <th style="padding:8px 12px;text-align:left;font-size:12px">Row</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px">Error</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>
    <div class="text-muted" style="font-size:11px;margin-top:4px">${data.length} error(s)</div>`;
}

// ─── Key-value object: {field: value, ...} ───
function _renderKeyValue(data, opts) {
    if (!data || typeof data !== 'object') return '';

    const skipKeys = new Set(opts.skipKeys || ['doctype', 'docstatus', 'owner', 'modified_by', '__islocal', '__unsaved', '_comments', '_liked_by', '_assign', 'idx']);
    const entries = Object.entries(data).filter(([k]) => !skipKeys.has(k) && !k.startsWith('_'));

    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">Empty</div>';

    const rows = entries.map(([key, val]) => {
        let display;
        if (val === null || val === undefined || val === '') {
            display = '<span class="text-muted">—</span>';
        } else if (typeof val === 'object') {
            display = `<code style="font-size:12px;word-break:break-all">${frappe.utils.escape_html(JSON.stringify(val))}</code>`;
        } else {
            display = frappe.utils.escape_html(String(val));
        }
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:6px 12px;font-weight:600;font-size:13px;white-space:nowrap;vertical-align:top;color:var(--heading-color)">${frappe.utils.escape_html(label)}</td>
            <td style="padding:6px 12px;font-size:13px">${display}</td>
        </tr>`;
    }).join('');

    return `<div style="border:1px solid var(--border-color);border-radius:var(--border-radius-lg);max-height:400px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
    </div>`;
}

// ─── Mapping: {file_col: target_field, ...} ───
function _renderMapping(data, opts) {
    if (!data || typeof data !== 'object') return '';
    const entries = Object.entries(data);
    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">No mapping defined</div>';

    const rows = entries.map(([src, target]) => {
        return `<tr style="border-bottom:1px solid var(--border-color)">
            <td style="padding:6px 12px;font-weight:600;font-size:13px">${frappe.utils.escape_html(src)}</td>
            <td style="padding:6px 12px;text-align:center;color:var(--text-muted)">→</td>
            <td style="padding:6px 12px;font-size:13px">${target ? frappe.utils.escape_html(target) : '<span class="text-muted">— Skip —</span>'}</td>
        </tr>`;
    }).join('');

    return `<div style="border:1px solid var(--border-color);border-radius:var(--border-radius-lg);max-height:300px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-light-gray)">
                <th style="padding:6px 12px;text-align:left;font-size:12px">File Column</th>
                <th style="padding:6px 12px;width:30px"></th>
                <th style="padding:6px 12px;text-align:left;font-size:12px">Target Field</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ─── Array of objects ───
function _renderArray(data, opts) {
    if (!data.length) return '<div class="text-muted" style="padding:8px 0">Empty list</div>';

    // If items have 'row' and 'error' keys → treat as error list
    if (data[0].row !== undefined && (data[0].error || data[0].message)) {
        return _renderErrorList(data, opts);
    }

    // Generic array of objects → table
    const keys = [...new Set(data.flatMap(d => typeof d === 'object' ? Object.keys(d) : []))].filter(k => !k.startsWith('_'));
    if (!keys.length) {
        return `<div style="padding:8px 0;font-size:13px">${data.length} item(s)</div>`;
    }

    const thead = keys.map(k => `<th style="padding:6px 10px;text-align:left;font-size:12px">${frappe.utils.escape_html(k.replace(/_/g,' '))}</th>`).join('');
    const tbody = data.slice(0, opts.limit || 50).map(row => {
        const cells = keys.map(k => {
            const v = typeof row === 'object' ? (row[k] ?? '') : row;
            return `<td style="padding:6px 10px;font-size:12px">${frappe.utils.escape_html(String(v))}</td>`;
        }).join('');
        return `<tr style="border-bottom:1px solid var(--border-color)">${cells}</tr>`;
    }).join('');

    return `<div style="border:1px solid var(--border-color);border-radius:var(--border-radius-lg);max-height:400px;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-light-gray)">${thead}</tr></thead>
            <tbody>${tbody}</tbody>
        </table>
    </div>
    ${data.length > (opts.limit||50) ? `<div class="text-muted" style="font-size:11px;margin-top:4px">Showing ${opts.limit||50} of ${data.length}</div>` : ''}`;
}

// ─── Extract readable error message from raw API error string ───
function _extractErrorMessage(raw) {
    if (!raw) return 'Unknown error';
    try {
        // Try to find the meaningful message
        let m = raw.match(/"message"\s*:\s*"([^"]+)"/);
        if (m) return m[1];
        m = raw.match(/ValidationError:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
        m = raw.match(/OperationalError.*?:\s*(.+?)(?:\\n|$)/);
        if (m) return m[1].trim();
        m = raw.match(/"exception"\s*:\s*"[^:]+:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
        // Decode unicode escapes
        if (raw.includes('\\u0')) {
            try {
                const decoded = JSON.parse('"' + raw.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"');
                if (decoded !== raw) return _extractErrorMessage(decoded);
            } catch(e) {}
        }
    } catch(e) {}
    // Fallback: strip noise
    return raw.replace(/https?:\/\/[^\s,}"]+/g, '').replace(/\\n/g, ' ').replace(/\\"/g, '"').substring(0, 300);
}
