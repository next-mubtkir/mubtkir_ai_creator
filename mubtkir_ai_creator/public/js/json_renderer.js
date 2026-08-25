/**
 * Mubtkir AI Creator — JSON Field Renderer
 * Replaces ALL raw JSON/Code fields with human-readable formatted displays.
 * ZERO JSON code visible to the user — only clean tables and summaries.
 */
window.mubtkir = window.mubtkir || {};

mubtkir.renderJsonField = function(frm, fieldname, options) {
    options = options || {};
    var wrapper = frm.fields_dict[fieldname];
    if (!wrapper || !wrapper.$wrapper) return;

    var raw = frm.doc[fieldname];
    if (!raw || raw === '[]' || raw === '{}' || raw === 'null') {
        wrapper.$wrapper.find('.mubtkir-rendered').remove();
        if (options.hideEmpty !== false) {
            _hideRaw(wrapper.$wrapper);
            wrapper.$wrapper.find('.form-group').append('<div class="mubtkir-rendered text-muted" style="padding:8px 0;font-size:13px">No data</div>');
        }
        return;
    }

    var data;
    try { data = JSON.parse(raw); } catch(e) { return; }

    _hideRaw(wrapper.$wrapper);
    wrapper.$wrapper.find('.mubtkir-rendered').remove();

    var html;
    if (options.type === 'error_list') html = _renderErrorList(data, options);
    else if (options.type === 'key_value') html = _renderKV(data, options);
    else if (options.type === 'mapping') html = _renderMapping(data, options);
    else if (Array.isArray(data)) html = _renderArray(data, options);
    else if (typeof data === 'object') html = _renderKV(data, options);
    else html = '<div style="padding:8px 0;font-size:13px">' + _esc(String(data)) + '</div>';

    wrapper.$wrapper.find('.form-group').append('<div class="mubtkir-rendered">' + html + '</div>');
};

function _hideRaw($w) {
    // Hide the raw field display — covers ALL Frappe Code/Text field variants
    $w.find('.control-input-wrapper').hide();
}

function _esc(s) { return frappe.utils.escape_html(s); }

function _smartVal(key, val) {
    if (val === null || val === undefined || val === '') return '<span class="text-muted">—</span>';
    var k = (key || '').toLowerCase();

    if (typeof val === 'object') {
        if (Array.isArray(val)) {
            if (!val.length) return '<span class="text-muted">empty</span>';
            // Show count + first item summary
            var first = typeof val[0] === 'object' && val[0] ? Object.keys(val[0]).slice(0, 3).join(', ') : String(val[0]);
            return '<span class="text-muted">' + val.length + ' items (' + _esc(first) + '…)</span>';
        }
        var objKeys = Object.keys(val);
        if (!objKeys.length) return '<span class="text-muted">empty</span>';
        // Show key names only, no values
        return '<span class="text-muted">' + objKeys.length + ' fields (' + _esc(objKeys.slice(0, 4).join(', ')) + (objKeys.length > 4 ? '…' : '') + ')</span>';
    }

    var s = String(val);

    // Detect JSON-looking strings — show summary instead
    var trimmed = s.trim();
    if ((trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') && trimmed.length > 20) {
        try {
            var parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return '<span class="text-muted">' + parsed.length + ' items</span>';
            if (typeof parsed === 'object') return '<span class="text-muted">' + Object.keys(parsed).length + ' fields</span>';
        } catch(e) {}
    }

    // Large text content — show summary
    if (['html', 'script', 'css', 'content', 'code', 'json', 'style', 'raw_printing'].includes(k) && s.length > 100) {
        return '<span class="text-muted">' + k + ' — ' + s.length.toLocaleString() + ' chars</span>';
    }

    if (s.length > 250) return _esc(s.substring(0, 250)) + '<span class="text-muted">… ' + s.length.toLocaleString() + ' chars</span>';
    return _esc(s);
}

// ─── Error list ───
function _renderErrorList(data, opts) {
    if (!Array.isArray(data) || !data.length) return '<div class="text-muted" style="padding:8px 0">No errors</div>';
    var rows = data.slice(0, opts.limit || 100).map(function(e) {
        var msg = _extractErr(e.error || e.message || e.msg || '');
        return '<tr style="border-bottom:1px solid var(--border-color)">'
            + '<td style="padding:8px 12px;color:var(--red-500);font-weight:600;white-space:nowrap;vertical-align:top">Row ' + (e.row || '?') + '</td>'
            + '<td style="padding:8px 12px;font-size:13px">' + _esc(msg) + '</td>'
            + '</tr>';
    }).join('');
    return '<div style="max-height:350px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px">'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:var(--bg-light-gray)"><th style="padding:8px 12px;text-align:left;font-size:12px">Row</th><th style="padding:8px 12px;text-align:left;font-size:12px">Error</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>'
        + '<div class="text-muted" style="font-size:11px;margin-top:4px">' + data.length + ' error(s)</div>';
}

// ─── Key-value ───
function _renderKV(data, opts) {
    if (!data || typeof data !== 'object') return '';
    var skip = ['doctype', 'docstatus', 'owner', 'modified_by', 'creation', 'modified', '__islocal', '__unsaved', '_comments', '_liked_by', '_assign', 'idx', 'parent', 'parenttype', 'parentfield', 'name1'];
    var entries = Object.entries(data).filter(function(pair) { return skip.indexOf(pair[0]) === -1 && pair[0].charAt(0) !== '_'; });
    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">Empty</div>';
    var rows = entries.map(function(pair) {
        var key = pair[0], val = pair[1];
        var label = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        return '<tr style="border-bottom:1px solid var(--border-color)">'
            + '<td style="padding:6px 12px;font-weight:600;font-size:13px;white-space:nowrap;vertical-align:top;color:var(--heading-color)">' + _esc(label) + '</td>'
            + '<td style="padding:6px 12px;font-size:13px;word-break:break-word">' + _smartVal(key, val) + '</td>'
            + '</tr>';
    }).join('');
    return '<div style="border:1px solid var(--border-color);border-radius:8px;max-height:400px;overflow-y:auto">'
        + '<table style="width:100%;border-collapse:collapse"><tbody>' + rows + '</tbody></table></div>';
}

// ─── Mapping ───
function _renderMapping(data, opts) {
    if (!data || typeof data !== 'object') return '';
    var entries = Object.entries(data);
    if (!entries.length) return '<div class="text-muted" style="padding:8px 0">No mapping</div>';
    var rows = entries.map(function(pair) {
        return '<tr style="border-bottom:1px solid var(--border-color)">'
            + '<td style="padding:6px 12px;font-weight:600;font-size:13px">' + _esc(pair[0]) + '</td>'
            + '<td style="padding:6px 12px;text-align:center;color:var(--text-muted)">→</td>'
            + '<td style="padding:6px 12px;font-size:13px">' + (pair[1] ? _esc(pair[1]) : '<span class="text-muted">— Skip —</span>') + '</td>'
            + '</tr>';
    }).join('');
    return '<div style="border:1px solid var(--border-color);border-radius:8px;max-height:300px;overflow-y:auto">'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr style="background:var(--bg-light-gray)"><th style="padding:6px 12px;text-align:left;font-size:12px">File Column</th><th style="width:30px"></th><th style="padding:6px 12px;text-align:left;font-size:12px">Target Field</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
}

// ─── Array ───
function _renderArray(data, opts) {
    if (!data.length) return '<div class="text-muted" style="padding:8px 0">Empty list</div>';
    if (data[0] && data[0].row !== undefined && (data[0].error || data[0].message)) return _renderErrorList(data, opts);
    var keys = [];
    var seen = {};
    data.forEach(function(d) {
        if (typeof d === 'object' && d) {
            Object.keys(d).forEach(function(k) { if (k.charAt(0) !== '_' && !seen[k]) { seen[k] = 1; keys.push(k); } });
        }
    });
    if (!keys.length) return '<div style="padding:8px 0;font-size:13px">' + data.length + ' item(s)</div>';
    var thead = keys.map(function(k) { return '<th style="padding:6px 10px;text-align:left;font-size:12px">' + _esc(k.replace(/_/g, ' ')) + '</th>'; }).join('');
    var limit = opts.limit || 50;
    var tbody = data.slice(0, limit).map(function(row) {
        var cells = keys.map(function(k) {
            return '<td style="padding:6px 10px;font-size:12px">' + (typeof row === 'object' && row ? _smartVal(k, row[k]) : _esc(String(row))) + '</td>';
        }).join('');
        return '<tr style="border-bottom:1px solid var(--border-color)">' + cells + '</tr>';
    }).join('');
    var extra = data.length > limit ? '<div class="text-muted" style="font-size:11px;margin-top:4px">Showing ' + limit + ' of ' + data.length + '</div>' : '';
    return '<div style="border:1px solid var(--border-color);border-radius:8px;max-height:400px;overflow:auto">'
        + '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg-light-gray)">' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>' + extra;
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
        var decoded = raw;
        if (raw.indexOf('\\u0') !== -1) { try { decoded = JSON.parse('"' + raw.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'); } catch(e) {} }
        var m = decoded.match(/"message"\s*:\s*"([^"]+)"/);
        if (m) return m[1];
        m = decoded.match(/(?:Validation|LinkValidation)Error:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
        // OperationalError with or without prefix
        m = decoded.match(/OperationalError[:\s]*\((\d+)/);
        if (!m) m = decoded.match(/^\s*\((\d{4}),/);
        if (!m) m = decoded.match(/["\s]\((\d{4}),/);
        if (m) {
            var code = m[1];
            var valMatch = decoded.match(/'([^']{1,80})'/);
            var detail = valMatch ? ' (value: ' + valMatch[1] + ')' : '';
            return (translations[code] || 'Database error (' + code + ')') + detail;
        }
        m = decoded.match(/"exception"\s*:\s*"[^:]+:\s*(.+?)(?:\\n|",|$)/);
        if (m) return m[1].trim();
    } catch(e) {}
    return raw.replace(/https?:\/\/[^\s,}"]+/g, '').replace(/\\n/g, ' ').replace(/\\"/g, '"').substring(0, 300);
}
