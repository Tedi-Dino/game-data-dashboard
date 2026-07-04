import { items } from '../core/state.js';
import { parseFloatOrNull, parseDateOrNull } from '../core/utils.js';
import { bulkReplaceItems, updateLastModifiedTimestamp } from './firestore.js';

// CSV header columns
const HEADERS = ['id', 'name', 'type', 'sort', 'status', 'purchaseDate', 'startDate', 'purchasePrice',
    'from', 'playTime', 'passDate', 'sellDate', 'sellPrice', 'rating',
    'episodeCount', 'episodeDuration', 'steam_app_id', 'steam_override', 'fullyCompleted', 'remarks'];

// Parse a single CSV row into an item object
const parseCSVRow = (values, headerIndexMap) => {
    const getVal = (headerName) => values[headerIndexMap[headerName]] || '';
    const item = {
        id: getVal('id'),
        name: getVal('name'),
        sort: getVal('sort'),
        type: getVal('type'),
        from: getVal('from'),
        status: getVal('status'),
        purchaseDate: parseDateOrNull(getVal('purchaseDate')),
        startDate: parseDateOrNull(getVal('startDate')),
        purchasePrice: parseFloatOrNull(getVal('purchasePrice')),
        passDate: parseDateOrNull(getVal('passDate')),
        sellDate: parseDateOrNull(getVal('sellDate')),
        sellPrice: parseFloatOrNull(getVal('sellPrice')),
        playTime: parseFloatOrNull(
            headerIndexMap['playTime'] !== undefined ? getVal('playTime') : getVal('time')
        ),
        rating: parseFloatOrNull(getVal('rating')),
        episodeCount: parseFloatOrNull(getVal('episodeCount')),
        episodeDuration: parseFloatOrNull(getVal('episodeDuration'))
    };
    // Steam fields: only include when present in CSV
    const rawAppId = getVal('steam_app_id');
    // Use parseInt for integer IDs — parseFloat loses precision for large values
    const parsedAppId = parseInt(rawAppId, 10);
    if (!isNaN(parsedAppId) && parsedAppId > 0) item.steam_app_id = parsedAppId;
    const rawOverride = getVal('steam_override');
    if (rawOverride) item.steam_override = rawOverride.toLowerCase() === 'true';
    const rawCompleted = getVal('fullyCompleted');
    if (rawCompleted) item.fullyCompleted = rawCompleted.toLowerCase() === 'true';
    const rawRemarks = getVal('remarks');
    if (rawRemarks) item.remarks = rawRemarks;
    return (!item.id || !item.name || !item.type) ? null : item;
};

// Parse a single CSV line handling quoted fields with commas
const parseCSVLine = (line) => {
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
const splitCSVRows = (text) => {
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

// Parse CSV text into items array
export const importCSV = async (text) => {
    if (text.length > 5 * 1024 * 1024) {
        throw new Error('CSV文件过大（超过5MB），请检查文件。');
    }
    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // Parse rows using the quote-aware parser so that quoted fields with
    // embedded newlines (RFC 4180) are not split across multiple rows.
    const rows = splitCSVRows(text);
    const headers = parseCSVLine(rows[0]).map(h => h.replace(/"/g, ''));
    const headerIndexMap = {};
    headers.forEach((h, i) => { headerIndexMap[h] = i; });

    if (headerIndexMap['id'] === undefined ||
        headerIndexMap['name'] === undefined ||
        headerIndexMap['type'] === undefined) {
        throw new Error('CSV文件必须包含 id, name, 和 type 表头。');
    }

    const rawRows = rows.slice(1).filter(r => r.trim());
    let skippedCount = 0;
    const newItems = rawRows
        .map(r => {
            const values = parseCSVLine(r);
            const item = parseCSVRow(values, headerIndexMap);
            if (!item) skippedCount++;
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

    if (skippedCount > 0) {
        console.warn(`CSV import: ${skippedCount} row(s) skipped due to missing id/name/type.`);
    }

    await bulkReplaceItems(newItems);
    await updateLastModifiedTimestamp();
};

// Convert a value for CSV export — handles Firestore Timestamps, Dates, booleans
const toCSVValue = (val) => {
    if (val == null) return '';
    // Firestore Timestamp objects have a .toDate() method
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return String(val);
};

// Export items to CSV file
export const exportCSV = () => {
    if (items.length === 0) return false;

    const csvContent = HEADERS.join(',') + '\r\n' +
        items.map(i => HEADERS.map(h => {
            const val = toCSVValue(i[h]);
            return `"${val.replace(/"/g, '""')}"`;
        }).join(',')).join('\r\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `game_cost_export_${new Date().toISOString().split('T')[0]}.csv`
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Delay revoking to ensure the download has started
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
};
