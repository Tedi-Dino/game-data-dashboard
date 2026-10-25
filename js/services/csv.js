import { items } from '../core/state.js';
import { bulkReplaceItems, updateLastModifiedTimestamp } from './firestore.js';
import { todayLocalISODate } from '../core/utils.js';
// Row/field parsing, import limits and formula-injection guards live in their
// own dependency-free module (see csv-parse.js) so they can be unit-tested
// without the Firestore import chain.
import { parseCSVText, serializeCSVField } from './csv-parse.js';

export { parseCSVText };

// CSV header columns
const HEADERS = ['id', 'name', 'type', 'sort', 'status', 'purchaseDate', 'startDate', 'purchasePrice',
    'from', 'playTime', 'passDate', 'sellDate', 'sellPrice', 'rating',
    'episodeCount', 'episodeDuration', 'steam_app_id', 'steam_override', 'fullyCompleted', 'remarks'];

// Full import: parse CSV text, then bulk-replace all items in Firestore.
// Returns a receipt so the caller can report exactly what happened — importing
// silently drops rows, so the UI must surface the skipped count, not swallow it.
export const importCSV = async (text) => {
    const { items: newItems, skippedDetails } = parseCSVText(text);
    await bulkReplaceItems(newItems);
    await updateLastModifiedTimestamp();
    return { imported: newItems.length, skipped: skippedDetails.length, skippedDetails };
};

// Export items to CSV file. Values go through serializeCSVField(), which
// handles Firestore Timestamps/Dates and the formula-injection guard.
export const exportCSV = () => {
    if (items.length === 0) return false;

    const csvContent = HEADERS.join(',') + '\r\n' +
        items.map(i => HEADERS.map(h => serializeCSVField(i[h])).join(',')).join('\r\n');

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
