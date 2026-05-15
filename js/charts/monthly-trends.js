import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS } from '../config/constants.js';
import { formatCurrency, normalizeMonth, renderStars, escapeHTML } from '../core/utils.js';
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

const buildTrends = (currentItems) => {
    const trends = {};
    const allMonths = new Set();

    // Map item.type to trend key
    const typeToKey = {
        physical: 'switch_physical',
        digital: 'switch_digital',
        ms: 'xbox'
    };

    currentItems.forEach(item => {
        const key = typeToKey[item.type] || item.type;

        // --- Cost processing ---
        // Purchase cost in the purchase month
        if (item.purchaseDate) {
            const purchaseMonth = normalizeMonth(item.purchaseDate);
            if (purchaseMonth) {
                allMonths.add(purchaseMonth);
                if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                const cost = item.purchasePrice || 0;
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
        if (item.type !== 'hardware' && (item.playTime || 0) > 0 && item.purchaseDate) {
            const purchaseMonth = normalizeMonth(item.purchaseDate);
            const isDrama = item.type === 'drama';
            const playtimeKey = isDrama ? 'dramaPlaytime' : 'playtime';

            if (item.status === 'passed' && item.passDate) {
                const startDate = new Date(item.purchaseDate);
                const endDate = new Date(item.passDate);

                if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate) {
                    const totalDurationDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24) + 1);
                    const dailyPlaytime = item.playTime / totalDurationDays;

                    const maxIter = new Date();
                    maxIter.setFullYear(maxIter.getFullYear() + 10);

                    for (let d = new Date(startDate); d <= endDate && d <= maxIter; d.setDate(d.getDate() + 1)) {
                        const monthStr = normalizeMonth(d);
                        if (monthStr) {
                            allMonths.add(monthStr);
                            if (!trends[monthStr]) trends[monthStr] = { ...DEFAULT_TREND };
                            trends[monthStr][playtimeKey] += dailyPlaytime;
                        }
                    }
                } else if (purchaseMonth) {
                    allMonths.add(purchaseMonth);
                    if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                    trends[purchaseMonth][playtimeKey] += (item.playTime || 0);
                }
            } else {
                if (purchaseMonth) {
                    allMonths.add(purchaseMonth);
                    if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                    trends[purchaseMonth][playtimeKey] += (item.playTime || 0);
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
const calcMonthlyPlaytime = (item, monthStart, monthEnd) => {
    if (!item.playTime || item.playTime <= 0 || item.type === 'hardware' || !item.purchaseDate) {
        return 0;
    }

    const startDate = new Date(item.purchaseDate);
    const endDate = (item.status === 'passed' && item.passDate)
        ? new Date(item.passDate)
        : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        return 0;
    }

    if (!(startDate <= monthEnd && endDate >= monthStart)) {
        return 0;
    }

    const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24) + 1);
    const daily = item.playTime / totalDays;
    const effStart = new Date(Math.max(startDate, monthStart));
    const effEnd = new Date(Math.min(endDate, monthEnd));
    const daysInMonth = (effEnd - effStart) / (1000 * 60 * 60 * 24) + 1;
    return daily * daysInMonth;
};

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
            const hasData = sortedMonths.some(m => (trends[m]?.[key] || 0) > 0);
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
        borderColor: '#c4a040',
        backgroundColor: '#c4a040',
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
        borderColor: '#c4556a',
        backgroundColor: '#c4556a',
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
        backgroundColor: 'rgba(196, 160, 64, 0.12)',
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

    if (charts[chartKey]) destroyChartWithTooltip(charts[chartKey]);

    charts[chartKey] = new Chart(el, {
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
                            // Hide platform bar chart legends, only show line legends
                            return ['游戏时长', '剧集时长', '合计时长'].includes(item.text);
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
                            .filter(i => normalizeMonth(i.purchaseDate) === month && (i.purchasePrice || 0) > 0)
                            .map(i => ({ name: i.name, value: i.purchasePrice || 0, type: 'purchase' }));

                        // Items sold this month
                        const saleItems = items
                            .filter(i => normalizeMonth(i.sellDate) === month && (i.sellPrice || 0) > 0)
                            .map(i => ({ name: i.name, value: -(i.sellPrice || 0), type: 'sale' }));

                        // Combined, sorted by absolute value
                        const allCostItems = [...purchaseItems, ...saleItems]
                            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                            .slice(0, 5);

                        // Top 5 playtimes for this month (amortized) - combined games and dramas
                        const currentMonthStart = new Date(month + '-01');
                        const currentMonthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0);

                        const topPlaytimeItems = items
                            .filter(i => i.type !== 'hardware')
                            .map(item => ({ ...item, monthlyPlaytime: calcMonthlyPlaytime(item, currentMonthStart, currentMonthEnd) }))
                            .filter(item => item.monthlyPlaytime > 0.01)
                            .sort((a, b) => b.monthlyPlaytime - a.monthlyPlaytime)
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1">${month} 月报</div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">当月收支 Top 5</h4><ul class="text-sm">';
                        allCostItems.forEach(item => {
                            const icon = item.type === 'sale' ? '💰' : '';
                            const color = item.value < 0 ? 'text-green-600' : '';
                            html += `<li class="flex justify-between my-1"><span>${icon}${escapeHTML((item.name || '').substring(0, 20))}</span><strong class="${color}">${formatCurrency(item.value)}</strong></li>`;
                        });
                        if (allCostItems.length === 0) html += '<li>无收支记录</li>';
                        html += '</ul>';

                        html += '<h4 class="font-semibold mt-2 mb-1">🎮📺 当月游戏/剧集 Top 5 (折算)</h4><ul class="text-sm">';
                        topPlaytimeItems.forEach(item => {
                            const prefix = item.type === 'drama' ? '📺 ' : '';
                            html += `<li class="flex justify-between my-1"><span>${prefix}${escapeHTML((item.name || '').substring(0, 15))}</span><span class="flex items-center"><strong>${item.monthlyPlaytime.toFixed(1)}h</strong>${renderStars(item.rating)}</span></li>`;
                        });
                        if (topPlaytimeItems.length === 0) html += '<li>无游玩记录</li>';
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    });
};
