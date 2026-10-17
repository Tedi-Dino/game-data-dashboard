import { items } from '../core/state.js';
import { parseFloatOrNull, parseDateOrNull } from '../core/utils.js';
import { bulkReplaceItems, updateLastModifiedTimestamp } from './firestore.js';
import { todayLocalISODate } from '../core/utils.js';
// Row/field parsing lives in its own dependency-free module (see csv-parse.js)
// so the CSV rules can be unit-tested without the Firestore import chain.
import { parseCSVLine, splitCSVRows } from './csv-parse.js';

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

// Parse CSV text into items array
export const parseCSVText = (text) => {
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
    const skippedDetails = [];
    const newItems = rawRows
        .map((r, idx) => {
            const values = parseCSVLine(r);
            const item = parseCSVRow(values, headerIndexMap);
            if (!item) {
                const missing = ['id', 'name', 'type'].filter(f => !values[headerIndexMap[f]]);
                skippedDetails.push({
                    row: idx + 2, // +2: header row plus 1-based numbering
                    preview: String(values[headerIndexMap['name']] || values.join(',')).slice(0, 30),
                    missing
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

// Full import: parse CSV text, then bulk-replace all items in Firestore.
// Returns a receipt so the caller can report exactly what happened — importing
// silently drops rows, so the UI must surface the skipped count, not swallow it.
export const importCSV = async (text) => {
    const { items: newItems, skippedDetails } = parseCSVText(text);
    await bulkReplaceItems(newItems);
    await updateLastModifiedTimestamp();
    return { imported: newItems.length, skipped: skippedDetails.length, skippedDetails };
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
        download: `game_cost_export_${todayLocalISODate()}.csv`
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Delay revoking to ensure the download has started
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
};
