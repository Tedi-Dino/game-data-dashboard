// Currency formatter
export const formatCurrency = (value) => `¥${(value || 0).toFixed(2)}`;

// Safe numeric parser: returns null for empty/invalid input
export const parseFloatOrNull = (value) =>
    (value === '' || value === null || isNaN(parseFloat(value)) ? null : parseFloat(value));

// Safe date parser: returns null for falsy input
export const parseDateOrNull = (value) => (value ? value : null);

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
    str.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
