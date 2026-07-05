// Currency formatter — guards against NaN
export const formatCurrency = (value) => `¥${(Number.isFinite(value) ? value : 0).toFixed(2)}`;

// Plain number formatter (no ¥ symbol — for use with separate currency spans)
export const formatNumber = (value) => (Number.isFinite(value) ? value : 0).toFixed(2);

// Safe numeric parser: returns null for empty/invalid input
export const parseFloatOrNull = (value) =>
    (value === '' || value === null || isNaN(parseFloat(value)) ? null : parseFloat(value));

// Safe date parser: returns null for falsy or invalid input
export const parseDateOrNull = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

// Convert Firestore Timestamp, Date, or string to YYYY-MM-DD for <input type="date">
export const formatDateForInput = (value) => {
    if (!value) return '';
    if (value.toDate) return value.toDate().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    // Parse string — handle both YYYY-MM-DD and YYYY/M/D formats
    const normalized = String(value).replace(/\//g, '-');
    const d = parseLocalDateOnly(normalized);
    if (!d) return normalized.slice(0, 10);
    // Format as local YYYY-MM-DD for <input type="date">
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return \-\-\;
};

// Format a Date/Timestamp to "MM/DD HH:mm"
export const formatDateTime = (value) => {
    let d = value?.toDate ? value.toDate() : (value instanceof Date ? value : null);
    if (!d && typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (!d) return '';
    return `${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)} ${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}`;
};

// Normalize a date string to "YYYY-MM" format (UTC-consistent)
export const normalizeMonth = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    // Use UTC to avoid timezone-dependent month grouping
    return date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2);
};

// Render star rating as HTML (10-point scale → 5 stars with half-star support)
const SOLID_STAR = '★';

export const renderStars = (rating, withMargin = true) => {
    if (!rating || rating < 1) return '';
    // Cap at 10 (5 full stars) to avoid negative empty stars
    const clamped = Math.min(rating, 10);
    const margin = withMargin ? 'ml-2' : '';
    const fullStars = Math.floor(clamped / 2);
    const hasHalf = (clamped % 2) >= 1;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    const halfStarHtml = '<span style="position:relative;display:inline-block;width:1em"><span style="position:absolute;overflow:hidden;width:50%">★</span><span style="color:#d4d4d8">★</span></span>';
    return `<span class="text-yellow-400 ${margin}">${SOLID_STAR.repeat(fullStars)}${hasHalf ? halfStarHtml : ''}${'<span style="color:#d4d4d8">' + SOLID_STAR.repeat(emptyStars) + '</span>'}</span>`;
};

export const renderStarsForTable = (rating) => {
    if (!rating || rating < 1) return '/';
    return renderStars(rating, false);
};

// djb2 hash — better distribution than simple << 5 reduce
export const hashCode = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash;
};

// Get the effective start date for playtime calculations.
// Falls back to purchaseDate when startDate is not set.
export const getStartDate = (item) => item.startDate || item.purchaseDate;

export const UNSOLD_PHYSICAL_ESTIMATED_COST = 30;
export const UNSOLD_PHYSICAL_ESTIMATE_REMARK = '预估值';

// Parse a YYYY-MM-DD date string as a local date (not UTC).
// Avoids timezone pitfalls where '2026-07-01' could be interpreted as June 30
// in UTC+ timezones. Returns null for invalid/falsy input.
export const parseLocalDateOnly = (dateStr) => {
    if (!dateStr) return null;
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
};

export const isUnsoldPhysical = (item) => item?.type === 'physical' && !item.sellDate;

// Net cost: unsold physical cartridges use a fixed resale estimate, others use purchase minus sale.
export const netCost = (item) => {
    if (isUnsoldPhysical(item)) return UNSOLD_PHYSICAL_ESTIMATED_COST;
    return (item?.purchasePrice || 0) - (item?.sellPrice || 0);
};

export const effectiveRemarks = (item) => item?.remarks || (isUnsoldPhysical(item) ? UNSOLD_PHYSICAL_ESTIMATE_REMARK : '');

// Escape HTML special characters to prevent XSS
export const escapeHTML = (str) => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};
