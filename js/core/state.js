// Centralized application state
// This module holds mutable state shared across modules.
// Each property documents which modules read/write it.

// All game/hardware items from Firestore
export let items = [];

// Steam cumulative-playtime snapshots keyed by YYYY-MM and tracking metadata.
export let steamPlaytimeMonths = new Map();
export let steamPlaytimeStates = new Map();
export let steamPlaytimeTracking = null;

// Current table sort configuration
export let sortConfig = { key: '_default', direction: 'desc' };

// Whether we're editing an item from the list modal (vs direct add)
export let isEditingFromList = false;

// Active Chart.js instances (keyed by chart name)
// Use setChart/removeChart for lifecycle management
const _charts = {};
export { _charts as charts };

// --- Setters (prefer these over direct mutation for traceability) ---

export const setItems = (newItems) => { items = newItems; };

export const setSteamPlaytimeMonths = (value) => {
    steamPlaytimeMonths = value instanceof Map ? value : new Map(Object.entries(value || {}));
};

export const setSteamPlaytimeStates = (value) => {
    steamPlaytimeStates = value instanceof Map ? value : new Map(Object.entries(value || {}));
};

export const setSteamPlaytimeTracking = (value) => { steamPlaytimeTracking = value || null; };

export const setSortConfig = (key, direction) => { sortConfig = { key, direction }; };

export const setIsEditingFromList = (val) => { isEditingFromList = val; };

export const setChart = (name, chartInstance) => { _charts[name] = chartInstance; };

export const removeChart = (name) => { delete _charts[name]; };

export const getChart = (name) => _charts[name] || null;
