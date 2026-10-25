// Pure table helpers shared by the data table, KPI filters and unit tests.
// This module deliberately has no DOM / Firebase dependencies so its sorting,
// filtering and pagination rules can be exercised under `node --test`.
import { TYPE_MAP, FROM_MAP, STATUS_MAP } from '../config/constants.js';
import { netCost, effectiveRemarks, getStartDate, parseLocalDateOnly } from '../core/utils.js';

// Parse a stored 'YYYY-MM-DD' as LOCAL midnight. `new Date('YYYY-MM-DD')` would
// be UTC midnight and shift the calendar day in every non-UTC timezone.
const dateValue = (raw) => {
    if (!raw) return -Infinity;
    const date = parseLocalDateOnly(String(raw).split('T')[0]);
    return date ? date.getTime() : -Infinity;
};

export const isGameItem = (item) => item?.type !== 'hardware' && item?.type !== 'drama';
export const isDramaItem = (item) => item?.type === 'drama';

/** Value used by the single-column sorters. Mirrors what the table displays. */
export const getSortValue = (item, key) => {
    const cost = netCost(item);
    switch (key) {
        case 'id': return item.id || '';
        case 'name': return item.name || '';
        case 'sort': return item.sort || '';
        case 'type': return TYPE_MAP[item.type] || item.type || '';
        case 'from': return FROM_MAP[item.from] || item.from || '';
        case 'status': return STATUS_MAP[item.status] || item.status || '';
        case 'purchaseDate': return dateValue(item.purchaseDate);
        case 'startDate': return dateValue(item.startDate);
        case 'passDate': return dateValue(item.passDate);
        case 'sellDate': return dateValue(item.sellDate);
        case 'purchasePrice': return item.purchasePrice ?? -1;
        case 'actualCost': return cost;
        case 'playTime': return item.playTime ?? -1;
        // Items without playtime have no meaningful hourly cost. Infinity keeps
        // them at the "worst value" end for ascending sorts instead of the best.
        case 'costPerHour': return (!item.playTime || item.playTime <= 0 ? Infinity : cost / item.playTime);
        case 'rating': return item.rating ?? 0;
        case 'steam': return item.steam_app_id ? 1 : 0;
        default: return '';
    }
};

const compareValues = (a, b) => {
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'zh-CN');
    return a < b ? -1 : (a > b ? 1 : 0);
};

// Default order used when no column is selected:
//   playing (oldest start first) → passed (newest pass first) → rest (newest buy first)
const defaultCompare = (a, b) => {
    const statusOrder = { playing: 0, passed: 1 };
    const aStatus = statusOrder[a.status] ?? 2;
    const bStatus = statusOrder[b.status] ?? 2;
    if (aStatus !== bStatus) return aStatus - bStatus;

    if (a.status === 'playing') {
        return dateValue(getStartDate(a)) - dateValue(getStartDate(b));
    }
    if (a.status === 'passed') {
        return dateValue(b.passDate) - dateValue(a.passDate);
    }
    return dateValue(b.purchaseDate) - dateValue(a.purchaseDate);
};

/** Sort a copy of `source`; never mutates the caller's array. */
export const sortItems = (source, sortConfig) => {
    const list = [...(source || [])];
    const key = sortConfig?.key;
    if (!key || key === '_default') {
        return list.sort(defaultCompare);
    }
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => direction * compareValues(getSortValue(a, key), getSortValue(b, key)));
};

const push = (parts, value) => {
    if (value !== null && value !== undefined && value !== '') parts.push(String(value));
};

/**
 * Searchable text for one row.
 * Collapsed detail columns are excluded by default so the search matches what
 * the user can currently see (the original behaviour). Expanding the detail
 * columns widens the haystack on the next render.
 */
export const getSearchableText = (item, expanded = false) => {
    const parts = [];
    push(parts, item.id);
    push(parts, item.name);
    push(parts, item.sort);

    if (item.rating) {
        push(parts, item.rating);
        push(parts, `${item.rating}分`);
    }
    if (item.playTime !== null && item.playTime !== undefined) {
        push(parts, item.playTime);
        push(parts, `${item.playTime}h`);
    }
    push(parts, item.passDate);

    const cost = netCost(item);
    push(parts, cost);
    push(parts, `¥${cost}`);
    if (item.playTime > 0 && Number.isFinite(cost)) {
        const cph = cost / item.playTime;
        push(parts, cph.toFixed(2));
        push(parts, `¥${cph.toFixed(2)}`);
    }

    push(parts, STATUS_MAP[item.status] || item.status);
    push(parts, effectiveRemarks(item));
    if (item.fullyCompleted) push(parts, '全成就');

    if (expanded) {
        push(parts, item.purchaseDate);
        push(parts, item.startDate);
        push(parts, item.purchasePrice);
        push(parts, item.type);
        push(parts, TYPE_MAP[item.type]);
        push(parts, item.from);
        push(parts, FROM_MAP[item.from]);
    }

    return parts.join(' ').toLowerCase();
};

export const matchesSearch = (item, term, expanded = false) => {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return true;
    return getSearchableText(item, expanded).includes(normalized);
};

/** Pagination result. A pageSize of 0 means "show everything". */
export const paginateItems = (list, page, pageSize) => {
    const items = Array.isArray(list) ? list : [];
    const total = items.length;
    const size = Number(pageSize) || 0;
    if (size <= 0) {
        return { items: items.slice(), page: 1, totalPages: 1, total, start: total ? 1 : 0, end: total };
    }
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const startIndex = (safePage - 1) * size;
    return {
        items: items.slice(startIndex, startIndex + size),
        page: safePage,
        totalPages,
        total,
        start: total ? startIndex + 1 : 0,
        end: Math.min(startIndex + size, total),
    };
};

/** Consistent two-decimal hour formatting (matches the KPI cards). */
export const formatHours = (value) => {
    // Missing/blank hours are unknown, not zero: display a dash instead of
    // implying the item was never played. `0` remains a real value.
    if (value === null || value === undefined || value === '') return '/';
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)}h` : '/';
};

// --- KPI → table filters -----------------------------------------------------
// A KPI card click opens the detail table pre-filtered with these predicates.
export const KPI_FILTERS = {
    all: { label: '全部记录', predicate: () => true },
    games: { label: '游戏', predicate: (item) => isGameItem(item) },
    hardware: { label: '硬件设备', predicate: (item) => item?.type === 'hardware' },
    unfinishedGames: {
        label: '未通关游戏',
        predicate: (item) => isGameItem(item) && item.status !== 'passed',
    },
    playedGames: {
        label: '有时长的游戏',
        predicate: (item) => isGameItem(item) && (item.playTime || 0) > 0,
    },
    paidGames: {
        label: '付费游戏',
        predicate: (item) => isGameItem(item) && item.from !== 'free',
    },
    dramas: { label: '剧集', predicate: (item) => isDramaItem(item) },
    watchedDramas: {
        label: '有观看时长的剧集',
        predicate: (item) => isDramaItem(item) && (item.playTime || 0) > 0,
    },
};

// KPI element id → filter key. Kept as data so tests can assert every
// clickable KPI in index.html has a real predicate behind it.
export const KPI_FILTER_BY_ELEMENT = {
    'total-actual-cost': 'all',
    'game-actual-cost': 'games',
    'hardware-actual-cost': 'hardware',
    'unfinished-games-cost': 'unfinishedGames',
    'total-games': 'games',
    'total-playtime': 'playedGames',
    'avg-playtime': 'games',
    'cost-per-hour': 'paidGames',
    'total-dramas': 'dramas',
    'total-drama-time': 'watchedDramas',
    'avg-drama-time': 'dramas',
};

export const resolveKpiFilter = (elementId) => {
    const key = KPI_FILTER_BY_ELEMENT[elementId];
    return key ? { key, ...KPI_FILTERS[key] } : null;
};
