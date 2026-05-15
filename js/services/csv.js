import { items } from '../core/state.js';
import { parseFloatOrNull, parseDateOrNull } from '../core/utils.js';
import { bulkReplaceItems, updateLastModifiedTimestamp } from './firestore.js';

// CSV header columns
const HEADERS = ['id', 'name', 'type', 'sort', 'status', 'purchaseDate', 'purchasePrice',
    'from', 'playTime', 'passDate', 'sellDate', 'sellPrice', 'rating',
    'episodeCount', 'episodeDuration', 'steam_app_id', 'steam_override', 'fullyCompleted'];

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
    if (rawAppId) item.steam_app_id = Math.round(parseFloat(rawAppId));
    const rawOverride = getVal('steam_override').toLowerCase();
    if (rawOverride) item.steam_override = rawOverride === 'true';
    const rawCompleted = getVal('fullyCompleted').toLowerCase();
    if (rawCompleted) item.fullyCompleted = rawCompleted === 'true';
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

// Parse CSV text into items array
export const importCSV = async (text) => {
    const rows = text.split(/\r\n|\n/);
    const headers = parseCSVLine(rows[0]).map(h => h.replace(/"/g, ''));
    const headerIndexMap = {};
    headers.forEach((h, i) => { headerIndexMap[h] = i; });

    if (headerIndexMap['id'] === undefined ||
        headerIndexMap['name'] === undefined ||
        headerIndexMap['type'] === undefined) {
        throw new Error('CSV文件必须包含 id, name, 和 type 表头。');
    }

    const newItems = rows.slice(1)
        .filter(r => r.trim())
        .map(r => {
            const values = parseCSVLine(r);
            return parseCSVRow(values, headerIndexMap);
        })
        .filter(Boolean);

    // Check for duplicate IDs
    if (new Set(newItems.map(i => i.id)).size !== newItems.length) {
        throw new Error('导入失败：ID重复。');
    }

    await bulkReplaceItems(newItems);
    await updateLastModifiedTimestamp();
};

// Export items to CSV file
export const exportCSV = () => {
    if (items.length === 0) return false;

    const csv = 'data:text/csv;charset=utf-8,﻿' +
        HEADERS.join(',') + '\r\n' +
        items.map(i => HEADERS.map(h => {
            const val = String(i[h] ?? '');
            return `"${val.replace(/"/g, '""')}"`;
        }).join(',')).join('\r\n');

    const link = Object.assign(document.createElement('a'), {
        href: encodeURI(csv),
        download: `game_cost_export_${new Date().toISOString().split('T')[0]}.csv`
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
};
