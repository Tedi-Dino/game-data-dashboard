// Data signatures that decide whether a chart needs to be rebuilt.
//
// Kept outside main.js so the "every rendered field must be in the signature"
// rule is unit-testable. A field that a chart reads but that is missing here
// makes the chart silently keep stale data after an edit.
export const CHART_FIELDS = {
    // cost: netCost() reads type/sellDate/purchasePrice/sellPrice; tooltip reads name.
    cost: ['purchasePrice', 'sellPrice', 'type', 'sellDate', 'from', 'remarks', 'name'],
    // time: tooltip reads name, sector size reads playTime.
    time: ['playTime', 'type', 'status', 'name'],
    // scatter: y depends on isUnsoldPhysical -> sellDate/purchasePrice;
    // tooltip reads rating/remarks/from/name.
    scatter: ['playTime', 'purchasePrice', 'sellPrice', 'rating', 'type', 'name', 'from', 'remarks', 'sellDate'],
    // monthly: playtime attribution reads steam_app_id/steam_override via
    // getTrackedState(), plus the dates and playTime; the tooltip renders stars.
    monthly: [
        'playTime', 'purchasePrice', 'sellPrice', 'type', 'status',
        'purchaseDate', 'startDate', 'sellDate', 'passDate',
        'name', 'episodeCount', 'episodeDuration', 'rating',
        'steam_app_id', 'steam_override',
    ],
    // genre: playTime drives the sector size itself.
    genre: ['sort', 'type', 'playTime', 'name', 'rating'],
};

// Fields folded into the full dashboard hash. It is a superset of what the
// charts render, so KPI/tooltip refreshes also happen when one of these changes.
export const ITEMS_HASH_FIELDS = [
    'fb_id', 'id', 'playTime', 'purchasePrice', 'sellPrice', 'rating',
    'status', 'type', 'sort', 'fullyCompleted', 'purchaseDate', 'startDate',
    'sellDate', 'passDate', 'name', 'from', 'episodeCount', 'episodeDuration',
    'remarks', 'steam_app_id', 'steam_override',
];

const signatureOf = (list, fields) =>
    (list || []).map(item => fields.map(field => item?.[field] ?? '').join('|')).join(',');

export const buildChartSignature = (list, chartName, steamHash = '', todayKey = '') => {
    const fields = CHART_FIELDS[chartName] || [];
    let signature = signatureOf(list, fields);
    // Unfinished games amortize up to "now", so the monthly chart also depends
    // on the wall clock (see monthly-trends.js). A page left open past midnight
    // must recompute the end date even when Firestore has not changed.
    if (chartName === 'monthly') {
        signature += `|steam:${steamHash}|today:${todayKey}`;
    }
    return signature;
};

export const buildItemsHash = (list, steamHash = '') =>
    `${signatureOf(list, ITEMS_HASH_FIELDS)}|${steamHash}`;
