import { items, steamPlaytimeMonths, steamPlaytimeStates, steamPlaytimeTracking, setChart, getChart } from '../core/state.js';
import { PLATFORM_COLORS } from '../config/constants.js';
import { formatCurrency, normalizeMonth, renderStars, escapeHTML, getStartDate, netCost, isUnsoldPhysical } from '../core/utils.js';
import { createExternalTooltip, destroyChartWithTooltip } from './setup.js';

const DEFAULT_TREND = {
    hardware: 0, switch_physical: 0, switch_digital: 0, steam: 0, epic: 0,
    ubi: 0, gog: 0, ps: 0, xbox: 0, appstore: 0, googleplay: 0,
    emulator: 0, other: 0, drama: 0, playtime: 0, dramaPlaytime: 0
};

const PLATFORM_DATA_KEYS = [
    { label: '硬件', key: 'hardware', color: PLATFORM_COLORS.hardware },
    { label: 'Switch 实体', key: 'switch_physical', color: PLATFORM_COLORS.switch_physical },
    { label: 'Switch 数字', key: 'switch_digital', color: PLATFORM_COLORS.switch_digital },
    { label: 'Steam', key: 'steam', color: PLATFORM_COLORS.steam },
    { label: 'Epic', key: 'epic', color: PLATFORM_COLORS.epic },
    { label: 'Uplay', key: 'ubi', color: PLATFORM_COLORS.ubi },
    { label: 'GOG', key: 'gog', color: PLATFORM_COLORS.gog },
    { label: 'PlayStation', key: 'ps', color: PLATFORM_COLORS.ps },
    { label: 'Xbox/MS', key: 'xbox', color: PLATFORM_COLORS.xbox },
    { label: 'App Store', key: 'appstore', color: PLATFORM_COLORS.appstore },
    { label: 'Google Play', key: 'googleplay', color: PLATFORM_COLORS.googleplay },
    { label: '模拟器', key: 'emulator', color: PLATFORM_COLORS.emulator },
    { label: 'Other', key: 'other', color: PLATFORM_COLORS.other },
    { label: '剧', key: 'drama', color: PLATFORM_COLORS.drama }
];

const asDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const calcAmortizedPlaytime = (totalHours, startDate, endDate, monthStart, monthEnd) => {
    const start = asDate(startDate);
    const end = asDate(endDate);
    if (!Number.isFinite(totalHours) || totalHours <= 0 || !start || !end || start > end) return 0;
    if (!(start <= monthEnd && end >= monthStart)) return 0;
    const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1);
    const effectiveStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const effectiveEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
    const days = (effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24) + 1;
    return (totalHours / totalDays) * days;
};

const getTrackedState = (item) => {
    if (item.type === 'hardware' || item.type === 'drama' || item.steam_override === false || item.steam_app_id == null) return null;
    return item.steam_app_id != null ? item.steam_app_id : null;
};

const getHistoryEndDate = (item, state) => {
    const initialDate = asDate(state?.initialObservedAt);
    const passDate = item.passDate ? asDate(item.passDate) : null;
    if (initialDate && passDate && passDate < initialDate) return passDate;
    return initialDate;
};

const getItemMonthlyPlaytime = (item, monthStart, monthEnd, monthKey) => {
    if (item.type === 'hardware') return {total: 0, tracked: 0, estimated: 0, source: 'local'};
    const appId = getTrackedState(item);
    const state = appId == null ? null : (steamPlaytimeStates.get(String(appId)) || null);
    if (appId != null && state) {
        const historyEnd = getHistoryEndDate(item, state);
        const historical = historyEnd
            ? calcAmortizedPlaytime((state.initialTotalMinutes || 0) / 60, getStartDate(item), historyEnd, monthStart, monthEnd)
            : 0;
        const monthData = steamPlaytimeMonths.get(monthKey);
        const tracked = Number(monthData?.minutesByApp?.[String(appId)] || monthData?.minutesByApp?.[appId] || 0) / 60;
        return {total: historical + tracked, tracked, estimated: historical, source: 'steam'};
    }
    if (!item.playTime || item.playTime <= 0 || !getStartDate(item)) return {total: 0, tracked: 0, estimated: 0, source: 'local'};
    const endDate = (item.status === 'passed' && item.passDate) ? item.passDate : new Date();
    const local = calcAmortizedPlaytime(item.playTime, getStartDate(item), endDate, monthStart, monthEnd);
    return {total: local, tracked: 0, estimated: local, source: 'local'};
};

const buildTrends = (currentItems) => {
    const trends = {};
    const allMonths = new Set();

    // Map item.type to trend key
    const typeToKey = {
        physical: 'switch_physical',
        digital: 'switch_digital',
        ms: 'xbox'
    };

    const stateByAppId = steamPlaytimeStates;

    // Include all tracked Steam minutes in the main line, including apps not yet bound to an item.
    steamPlaytimeMonths.forEach((monthData, month) => {
        allMonths.add(month);
        if (!trends[month]) trends[month] = { ...DEFAULT_TREND };
        const minutes = monthData?.minutesByApp || {};
        trends[month].playtime += Object.values(minutes).reduce((sum, value) => sum + Number(value || 0), 0) / 60;
    });

    currentItems.forEach(item => {
        const key = typeToKey[item.type] || item.type;

        // --- Cost processing ---
        // Purchase cost in the purchase month
        if (item.purchaseDate) {
            const purchaseMonth = normalizeMonth(item.purchaseDate);
            if (purchaseMonth) {
                allMonths.add(purchaseMonth);
                if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                const cost = isUnsoldPhysical(item) ? netCost(item) : (item.purchasePrice || 0);
                if (cost > 0 && trends[purchaseMonth][key] !== undefined) {
                    trends[purchaseMonth][key] += cost;
                }
            }
        }

        // Sell revenue in the sell month (reduces cost, can make month negative)
        if (item.sellDate) {
            const sellMonth = normalizeMonth(item.sellDate);
            if (sellMonth) {
                allMonths.add(sellMonth);
                if (!trends[sellMonth]) trends[sellMonth] = { ...DEFAULT_TREND };
                const revenue = item.sellPrice || 0;
                if (revenue > 0 && trends[sellMonth][key] !== undefined) {
                    trends[sellMonth][key] -= revenue;
                }
            }
        }

        // --- Playtime processing ---
        if (item.type !== 'hardware' && (((item.playTime || 0) > 0 && getStartDate(item)) || getTrackedState(item))) {
            const isDrama = item.type === 'drama';
            const playtimeKey = isDrama ? 'dramaPlaytime' : 'playtime';
            const appId = getTrackedState(item);
            const state = appId == null ? null : stateByAppId.get(String(appId));
            const effectiveItem = item;
            const startDate = asDate(getStartDate(effectiveItem));
            const endDate = state ? getHistoryEndDate(effectiveItem, state) : ((item.status === 'passed' && item.passDate) ? asDate(item.passDate) : new Date());
            const totalHours = state ? (state.initialTotalMinutes || 0) / 60 : item.playTime;
            if (startDate && endDate && startDate <= endDate && totalHours > 0) {
                let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
                while (cursor <= endDate) {
                    const monthStr = normalizeMonth(cursor);
                    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
                    const amount = calcAmortizedPlaytime(totalHours, startDate, endDate, cursor, monthEnd);
                    if (monthStr && amount > 0) {
                        allMonths.add(monthStr);
                        if (!trends[monthStr]) trends[monthStr] = { ...DEFAULT_TREND };
                        // Steam monthly increments are added from the aggregate collection above.
                        trends[monthStr][playtimeKey] += amount;
                    }
                    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
                }
            }
        }
    });

    return { trends, allMonths };
};

/**
 * Compute playtime amortized across days that fall within the given month bounds.
 * For passed items: distributes playtime evenly from purchaseDate to passDate.
 * For in-progress items: distributes from purchaseDate to today.
 * Returns the portion (in hours) attributable to [monthStart, monthEnd].
 */
const calcMonthlyPlaytime = (item, monthStart, monthEnd, monthKey) =>
    getItemMonthlyPlaytime(item, monthStart, monthEnd, monthKey);

export const renderMonthlyTrendsChart = (isFullscreen = false) => {
    const canvasId = isFullscreen ? 'monthly-trends-chart-fullscreen' : 'monthly-trends-chart';
    const chartKey = isFullscreen ? 'monthlyTrendsFullscreen' : 'monthlyTrends';

    const excludeHardware = document.getElementById('exclude-hardware-checkbox')?.checked ?? false;
    const currentItems = excludeHardware ? items.filter(i => i.type !== 'hardware') : items;

    const { trends, allMonths } = buildTrends(currentItems);
    const sortedMonths = Array.from(allMonths).sort();

    // Platform datasets (stacked bars)
    const platformDatasets = PLATFORM_DATA_KEYS
        .filter(({ key }) => {
            const hasData = sortedMonths.some(m => (trends[m]?.[key] || 0) !== 0);
            return hasData;
        })
        .map(({ label, key, color }) => ({
            label,
            data: sortedMonths.map(m => trends[m]?.[key] || 0),
            backgroundColor: color,
            yAxisID: 'y',
            order: 2
        }));

    // Playtime line dataset (games)
    const playtimeDataset = {
        label: '游戏时长',
        data: sortedMonths.map(m => trends[m]?.playtime || 0),
        borderColor: PLATFORM_COLORS.emulator,
        backgroundColor: PLATFORM_COLORS.emulator,
        type: 'line',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y1',
        order: 1
    };

    // Drama playtime line dataset
    const dramaPlaytimeDataset = {
        label: '剧集时长',
        data: sortedMonths.map(m => trends[m]?.dramaPlaytime || 0),
        borderColor: PLATFORM_COLORS.drama,
        backgroundColor: PLATFORM_COLORS.drama,
        type: 'line',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y1',
        order: 1
    };

    // Total playtime area dataset (games + dramas)
    const totalPlaytimeDataset = {
        label: '合计时长',
        data: sortedMonths.map(m => (trends[m]?.playtime || 0) + (trends[m]?.dramaPlaytime || 0)),
        borderColor: 'transparent',
        backgroundColor: 'rgba(216, 200, 152, 0.12)',
        type: 'line',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        yAxisID: 'y1',
        order: 0
    };

    const el = document.getElementById(canvasId);
    if (!el) return;

    if (getChart(chartKey)) destroyChartWithTooltip(getChart(chartKey));

    setChart(chartKey, new Chart(el, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [...platformDatasets, playtimeDataset, dramaPlaytimeDataset, totalPlaytimeDataset]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        callback: (v) => sortedMonths[v] ? sortedMonths[v].substring(2).replace('-', '/') : ''
                    }
                },
                y: {
                    stacked: true,
                    position: 'left',
                    title: { display: true, text: '支出 (¥)' },
                    grid: { color: 'rgba(0, 0, 0, 0.06)' },
                    beginAtZero: true
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: '时长 (h)' },
                    grid: { drawOnChartArea: false },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    labels: {
                        filter: (item) => {
                            return item.text !== '合计时长';
                        }
                    }
                },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        if (!tooltip || !tooltip.body) return null;
                        const month = tooltip.title?.[0];
                        if (!month) return null;

                        // Items purchased this month
                        const purchaseItems = items
                            .filter(i => normalizeMonth(i.purchaseDate) === month && (isUnsoldPhysical(i) ? netCost(i) : (i.purchasePrice || 0)) > 0)
                            .map(i => ({ name: i.name, value: isUnsoldPhysical(i) ? netCost(i) : (i.purchasePrice || 0), type: 'purchase' }));

                        // Items sold this month
                        const saleItems = items
                            .filter(i => normalizeMonth(i.sellDate) === month && (i.sellPrice || 0) > 0)
                            .map(i => ({ name: i.name, value: -(i.sellPrice || 0), type: 'sale' }));

                        // Combined, sorted by absolute value
                        const allCostItems = [...purchaseItems, ...saleItems]
                            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                            .slice(0, 5);

                        // Top 5 playtimes for this month (amortized) - combined games and dramas
                        const [y, m] = month.split('-').map(Number);
                        const currentMonthStart = new Date(Date.UTC(y, m - 1, 1));
                        const currentMonthEnd = new Date(Date.UTC(y, m, 0));

                        const topPlaytimeItems = items
                            .filter(i => i.type !== 'hardware')
                            .map(item => ({ ...item, monthlyBreakdown: calcMonthlyPlaytime(item, currentMonthStart, currentMonthEnd, month) }))
                            .filter(item => item.monthlyBreakdown.total > 0.01)
                            .sort((a, b) => b.monthlyBreakdown.total - a.monthlyBreakdown.total)
                            .slice(0, 5);

                        const trackedHours = Object.values(steamPlaytimeMonths.get(month)?.minutesByApp || {})
                            .reduce((sum, value) => sum + Number(value || 0), 0) / 60;
                        const estimatedHours = items
                            .filter(i => i.type !== 'hardware')
                            .reduce((sum, item) => sum + calcMonthlyPlaytime(item, currentMonthStart, currentMonthEnd, month).estimated, 0);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1">${month} 月报</div>`;
                        const initializedAt = asDate(steamPlaytimeTracking?.initializedAt);
                        if (initializedAt && normalizeMonth(initializedAt) === month) {
                            html += `<div class="text-xs text-amber-600">追踪于 ${String(initializedAt.getUTCMonth() + 1).padStart(2, '0')}/${String(initializedAt.getUTCDate()).padStart(2, '0')} 开始；本月包含切换前估算</div>`;
                        }
                        html += '<h4 class="font-semibold mt-2 mb-1">当月收支 Top 5</h4><ul class="text-sm">';
                        allCostItems.forEach(item => {
                            const icon = item.type === 'sale' ? '💰' : '';
                            const color = item.value < 0 ? 'text-green-600' : '';
                            html += `<li class="flex justify-between my-1"><span>${icon}${escapeHTML((item.name || '').substring(0, 20))}</span><strong class="${color}">${formatCurrency(item.value)}</strong></li>`;
                        });
                        if (allCostItems.length === 0) html += '<li>无收支记录</li>';
                        html += '</ul>';

                        html += `<div class="text-xs text-stone-500 mt-2">Steam 实测：${Math.max(0, trackedHours).toFixed(1)}h；估算：${estimatedHours.toFixed(1)}h</div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">🎮📺 当月游戏/剧集 Top 5</h4><ul class="text-sm">';
                        topPlaytimeItems.forEach(item => {
                            const prefix = item.type === 'drama' ? '📺 ' : '';
                            const source = item.monthlyBreakdown.source === 'steam'
                                ? `${item.monthlyBreakdown.tracked > 0 ? `Steam 追踪 ${item.monthlyBreakdown.tracked.toFixed(1)}h` : ''}${item.monthlyBreakdown.estimated > 0 ? `${item.monthlyBreakdown.tracked > 0 ? ' + ' : ''}Steam 历史估算 ${item.monthlyBreakdown.estimated.toFixed(1)}h` : ''}`
                                : '本地估算';
                            html += `<li class="flex justify-between my-1"><span>${prefix}${escapeHTML((item.name || '').substring(0, 15))}<small class="ml-1 text-stone-400">${source}</small></span><span class="flex items-center"><strong>${item.monthlyBreakdown.total.toFixed(1)}h</strong>${renderStars(item.rating)}</span></li>`;
                        });
                        if (topPlaytimeItems.length === 0) html += '<li>无游玩记录</li>';
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    }));
};
