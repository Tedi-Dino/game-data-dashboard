// Currency formatter
export const formatCurrency = (value) => `¥${(value || 0).toFixed(2)}`;

// Safe numeric parser: returns null for empty/invalid input
export const parseFloatOrNull = (value) =>
    (value === '' || value === null || isNaN(parseFloat(value)) ? null : parseFloat(value));

// Safe date parser: returns null for falsy or invalid input
export const parseDateOrNull = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : value;
};

// Convert Firestore Timestamp, Date, or string to YYYY-MM-DD for <input type="date">
export const formatDateForInput = (value) => {
    if (!value) return '';
    if (value.toDate) return value.toDate().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const str = String(value).slice(0, 10);
    return str.replace(/\//g, '-');
};

// Normalize a date string to "YYYY-MM" format
export const normalizeMonth = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2);
};

// Render star rating as HTML
const SOLID_STAR = '★';

export const renderStars = (rating, withMargin = true) => {
    if (!rating || rating < 1) return '';
    const margin = withMargin ? 'ml-2' : '';
    return `<span class="text-yellow-400 ${margin}">${SOLID_STAR.repeat(rating)}</span>`;
};

export const renderStarsForTable = (rating) => {
    if (!rating || rating < 1) return '/';
    return renderStars(rating, false);
};

// Simple string hash for generating deterministic HSL colors
export const hashCode = (str) =>
    str.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) >>> 0, 0);

// Net cost: purchase price minus sell price
export const netCost = (item) => (item.purchasePrice || 0) - (item.sellPrice || 0);

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
