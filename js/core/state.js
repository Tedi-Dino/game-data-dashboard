// Centralized application state
// This module holds mutable state shared across modules.
// Each property documents which modules read/write it.

// All game/hardware items from Firestore
export let items = [];

// Current table sort configuration
export let sortConfig = { key: 'passDate', direction: 'desc' };

// Whether we're editing an item from the list modal (vs direct add)
export let isEditingFromList = false;

// Current mode for the price/time distribution bar chart
export let gameDistributionMode = 'time'; // 'time' | 'price'

// Active Chart.js instances (keyed by chart name)
export const charts = {};

// Whether to use Steam cloud playtime data (persisted in localStorage)
export let useSteamData = localStorage.getItem('useSteamData') !== 'false';

// --- Setters (prefer these over direct mutation for traceability) ---

export const setItems = (newItems) => { items = newItems; };

export const setSortConfig = (key, direction) => { sortConfig = { key, direction }; };

export const setIsEditingFromList = (val) => { isEditingFromList = val; };

export const setGameDistributionMode = (mode) => { gameDistributionMode = mode; };

export const setUseSteamData = (val) => {
    useSteamData = val;
    localStorage.setItem('useSteamData', val ? 'true' : 'false');
};
