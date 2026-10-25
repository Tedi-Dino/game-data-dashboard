// CSV row/field parsing — split out from csv.js so it can be unit-tested
// without pulling in the Firestore dependency chain.
// Handles quoted fields containing commas and embedded newlines (RFC 4180),
// enforces import limits, and guards against spreadsheet formula injection.

import { parseDateOrNull } from '../core/utils.js';

// --- Import limits ---------------------------------------------------------
// A dashboard import replaces the WHOLE collection, so an oversized or
// malformed file must fail before the first Firestore write.
export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_HEADERS = 64;

const TEXT_LIMITS = {
    id: 100,
    name: 300,
    type: 32,
    sort: 64,
    from: 32,
    status: 32,
    remarks: 2000,
};

// [min, max] — generous but far below values that would break charts or the
// 1 MiB Firestore document limit. Negative purchase/sell prices are legitimate
// (refunds and adjustments) and must survive export -> import; playtime,
// episodes and rating stay non-negative.
const NUMBER_LIMITS = {
    purchasePrice: [-10_000_000, 10_000_000],
    sellPrice: [-10_000_000, 10_000_000],
    playTime: [0, 1_000_000],
    rating: [0, 10],
    episodeCount: [0, 100_000],
    episodeDuration: [0, 10_000],
};

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const STRICT_CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const FORMULA_PREFIX_RE = /^\s*[=+\-@]/;

// Prefix a leading apostrophe so Excel/Sheets renders the cell as text instead
// of evaluating `=`, `+`, `-` or `@`. Only meaningful for string values.
export const sanitizeCSVField = (value) => {
    const text = String(value ?? '');
    return FORMULA_PREFIX_RE.test(text) ? `'${text}` : text;
};

// Undo sanitizeCSVField() on import so the stored value is what the user meant.
export const stripCSVGuard = (value) => {
    const text = String(value ?? '');
    return text.startsWith("'") && FORMULA_PREFIX_RE.test(text.slice(1))
        ? text.slice(1)
        : text;
};

// Serialize one value for CSV export. Firestore Timestamps and Dates become ISO
// strings. The formula guard only applies to strings: a numeric -123.45 is a
// real number and must not become text, while a string "-2+3" is dangerous.
export const serializeCSVField = (raw) => {
    if (raw == null) return '';
    let value;
    if (typeof raw.toDate === 'function') value = raw.toDate().toISOString();
    else if (raw instanceof Date) value = raw.toISOString();
    else value = String(raw);
    const safe = typeof raw === 'string' ? sanitizeCSVField(value) : value;
    return `"${safe.replace(/"/g, '""')}"`;
};

// Parse a single CSV line handling quoted fields with commas
export const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                values.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    values.push(current.trim());
    return values;
};

// Split CSV text into rows respecting quoted-field newlines (RFC 4180).
export const splitCSVRows = (text) => {
    const rows = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            current += ch;
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            }
        } else {
            if (ch === '"') {
                current += ch;
                inQuotes = true;
            } else if (ch === '\r' && text[i + 1] === '\n') {
                rows.push(current);
                current = '';
                i++;
            } else if (ch === '\n') {
                rows.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    if (current.length > 0 || rows.length > 0) rows.push(current);
    return rows;
};

// --- Field validation ------------------------------------------------------

const rowError = (rowNumber, message) => new Error(`CSV 第 ${rowNumber} 行：${message}`);

const readTextField = (value, field, rowNumber) => {
    const text = stripCSVGuard(value);
    const limit = TEXT_LIMITS[field];
    if (limit && text.length > limit) {
        throw rowError(rowNumber, `${field} 超过 ${limit} 字符`);
    }
    if (CONTROL_CHARS_RE.test(text)) {
        throw rowError(rowNumber, `${field} 含控制字符`);
    }
    if (field !== 'remarks' && STRICT_CONTROL_CHARS_RE.test(text)) {
        throw rowError(rowNumber, `${field} 含换行或制表符`);
    }
    return text;
};

const parseNumberField = (raw, field, rowNumber) => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (!NUMBER_RE.test(text)) {
        throw rowError(rowNumber, `${field} 不是有效数字`);
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
        throw rowError(rowNumber, `${field} 不是有限数字`);
    }
    const [min, max] = NUMBER_LIMITS[field];
    if (value < min || value > max) {
        throw rowError(rowNumber, `${field} 超出允许范围 ${min}..${max}`);
    }
    return value;
};

const parseDateField = (raw, field, rowNumber) => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const parsed = parseDateOrNull(text);
    if (!parsed) throw rowError(rowNumber, `${field} 日期无效（应为 YYYY-MM-DD）`);
    return parsed;
};

const parseBooleanField = (raw, field, rowNumber) => {
    const text = String(raw ?? '').trim();
    if (!text) return undefined;
    if (text.toLowerCase() === 'true') return true;
    if (text.toLowerCase() === 'false') return false;
    throw rowError(rowNumber, `${field} 只能是 true 或 false`);
};

const parseSteamAppId = (raw, rowNumber) => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw rowError(rowNumber, 'steam_app_id 必须是整数');
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw rowError(rowNumber, 'steam_app_id 超出安全整数范围');
    }
    return value;
};

// Parse a single CSV row into an item object. Throws on malformed values;
// returns null when the identity fields are missing (caller reports a skip).
export const parseCSVRow = (values, headerIndexMap, rowNumber) => {
    const getVal = (headerName) =>
        headerIndexMap[headerName] === undefined ? '' : (values[headerIndexMap[headerName]] || '');

    const id = readTextField(getVal('id'), 'id', rowNumber);
    const name = readTextField(getVal('name'), 'name', rowNumber);
    const type = readTextField(getVal('type'), 'type', rowNumber);
    if (!id || !name || !type) return null;

    const item = {
        id,
        name,
        sort: readTextField(getVal('sort'), 'sort', rowNumber),
        type,
        from: readTextField(getVal('from'), 'from', rowNumber),
        status: readTextField(getVal('status'), 'status', rowNumber),
        purchaseDate: parseDateField(getVal('purchaseDate'), 'purchaseDate', rowNumber),
        startDate: parseDateField(getVal('startDate'), 'startDate', rowNumber),
        purchasePrice: parseNumberField(getVal('purchasePrice'), 'purchasePrice', rowNumber),
        passDate: parseDateField(getVal('passDate'), 'passDate', rowNumber),
        sellDate: parseDateField(getVal('sellDate'), 'sellDate', rowNumber),
        sellPrice: parseNumberField(getVal('sellPrice'), 'sellPrice', rowNumber),
        playTime: parseNumberField(
            headerIndexMap['playTime'] !== undefined ? getVal('playTime') : getVal('time'),
            'playTime', rowNumber
        ),
        rating: parseNumberField(getVal('rating'), 'rating', rowNumber),
        episodeCount: parseNumberField(getVal('episodeCount'), 'episodeCount', rowNumber),
        episodeDuration: parseNumberField(getVal('episodeDuration'), 'episodeDuration', rowNumber),
    };

    const steamAppId = parseSteamAppId(getVal('steam_app_id'), rowNumber);
    if (steamAppId !== null) item.steam_app_id = steamAppId;

    const steamOverride = parseBooleanField(getVal('steam_override'), 'steam_override', rowNumber);
    if (steamOverride !== undefined) item.steam_override = steamOverride;

    const fullyCompleted = parseBooleanField(getVal('fullyCompleted'), 'fullyCompleted', rowNumber);
    if (fullyCompleted !== undefined) item.fullyCompleted = fullyCompleted;

    const remarks = readTextField(getVal('remarks'), 'remarks', rowNumber);
    if (remarks) item.remarks = remarks;

    return item;
};

// Parse CSV text into items array. Throws on oversized input, invalid headers,
// invalid values and duplicate ids; missing id/name/type rows are reported in
// `skippedDetails` instead of aborting the whole import.
export const parseCSVText = (text) => {
    if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) {
        throw new Error(`CSV文件过大（超过${CSV_MAX_BYTES / 1024 / 1024}MB），请检查文件。`);
    }
    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = splitCSVRows(text);
    if (rows.length === 0) throw new Error('CSV文件为空。');

    const headers = parseCSVLine(rows[0]).map((h) => stripCSVGuard(h.replace(/"/g, '').trim()));
    if (headers.length > CSV_MAX_HEADERS) {
        throw new Error(`CSV表头超过 ${CSV_MAX_HEADERS} 列。`);
    }
    const headerIndexMap = {};
    headers.forEach((h, i) => {
        if (!h) return;
        if (headerIndexMap[h] !== undefined) throw new Error(`CSV表头重复：${h}`);
        headerIndexMap[h] = i;
    });

    if (headerIndexMap['id'] === undefined ||
        headerIndexMap['name'] === undefined ||
        headerIndexMap['type'] === undefined) {
        throw new Error('CSV文件必须包含 id, name, 和 type 表头。');
    }

    const rawRows = rows.slice(1).filter((r) => r.trim());
    if (rawRows.length > CSV_MAX_ROWS) {
        throw new Error(`CSV行数超过 ${CSV_MAX_ROWS} 行上限。`);
    }

    const skippedDetails = [];
    const newItems = rawRows
        .map((r, idx) => {
            const rowNumber = idx + 2; // +2: header row plus 1-based numbering
            const values = parseCSVLine(r);
            const item = parseCSVRow(values, headerIndexMap, rowNumber);
            if (!item) {
                const missing = ['id', 'name', 'type'].filter((f) => !values[headerIndexMap[f]]);
                skippedDetails.push({
                    row: rowNumber,
                    preview: String(values[headerIndexMap['name']] || values.join(',')).slice(0, 30),
                    missing,
                });
            }
            return item;
        })
        .filter(Boolean);

    // Check for duplicate IDs — single-pass with early exit
    const seenIds = new Set();
    for (const item of newItems) {
        if (seenIds.has(item.id)) {
            throw new Error(`导入失败：ID "${item.id}" 重复。`);
        }
        seenIds.add(item.id);
    }

    if (skippedDetails.length > 0) {
        console.warn(`CSV import: ${skippedDetails.length} row(s) skipped due to missing id/name/type.`);
    }
    return { items: newItems, skipped: skippedDetails.length, skippedDetails };
};
