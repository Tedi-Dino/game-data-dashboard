import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS } from '../config/constants.js';
import { formatCurrency, normalizeMonth, renderStars } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

const DEFAULT_TREND = {
    hardware: 0, switch_physical: 0, switch_digital: 0, steam: 0, epic: 0,
    ubi: 0, gog: 0, ps: 0, xbox: 0, appstore: 0, googleplay: 0,
    emulator: 0, other: 0, playtime: 0
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
    { label: 'Other', key: 'other', color: PLATFORM_COLORS.other }
];

const buildTrends = (currentItems) => {
    const trends = {};
    const allMonths = new Set();

    currentItems.forEach(item => {
        // --- Cost processing ---
        if (item.purchaseDate) {
            const purchaseMonth = normalizeMonth(item.purchaseDate);
            if (purchaseMonth) {
                allMonths.add(purchaseMonth);
                if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                const cost = (item.purchasePrice || 0) - (item.sellPrice || 0);
                const key = item.type;
                if (trends[purchaseMonth][key] !== undefined) {
                    trends[purchaseMonth][key] += cost;
                }
            }
        }

        // --- Playtime processing ---
        if (item.type !== 'hardware' && (item.playTime || 0) > 0 && item.purchaseDate) {
            const purchaseMonth = normalizeMonth(item.purchaseDate);

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
                            trends[monthStr].playtime += dailyPlaytime;
                        }
                    }
                } else if (purchaseMonth) {
                    allMonths.add(purchaseMonth);
                    if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                    trends[purchaseMonth].playtime += (item.playTime || 0);
                }
            } else {
                if (purchaseMonth) {
                    allMonths.add(purchaseMonth);
                    if (!trends[purchaseMonth]) trends[purchaseMonth] = { ...DEFAULT_TREND };
                    trends[purchaseMonth].playtime += (item.playTime || 0);
                }
            }
        }
    });

    return { trends, allMonths };
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

    // Playtime line dataset (always shown)
    const playtimeDataset = {
        label: '时长',
        data: sortedMonths.map(m => trends[m]?.playtime || 0),
        borderColor: '#eab308',
        backgroundColor: '#eab308',
        type: 'line',
        tension: 0.3,
        yAxisID: 'y1',
        order: 1
    };

    const el = document.getElementById(canvasId);
    if (!el) return;

    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(el, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [...platformDatasets, playtimeDataset]
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
                    grid: { color: 'rgba(107, 114, 128, 0.5)' },
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
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        if (!tooltip || !tooltip.body) return null;
                        const month = tooltip.title?.[0];
                        if (!month) return null;

                        // Top 5 costs for this month
                        const topCostItems = items
                            .filter(i => normalizeMonth(i.purchaseDate) === month)
                            .map(i => ({ name: i.name, value: (i.purchasePrice || 0) - (i.sellPrice || 0) }))
                            .filter(i => i.value > 0)
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 5);

                        // Top 5 playtimes for this month (amortized)
                        const currentMonthStart = new Date(month + '-01');
                        const currentMonthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0);

                        const topTimeItems = items
                            .map(item => {
                                if (!item.playTime || item.playTime <= 0 || item.type === 'hardware' || !item.purchaseDate) {
                                    return { ...item, monthlyPlaytime: 0 };
                                }

                                if (item.status === 'passed' && item.passDate) {
                                    const startDate = new Date(item.purchaseDate);
                                    const endDate = new Date(item.passDate);
                                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate) {
                                        if (startDate <= currentMonthEnd && endDate >= currentMonthStart) {
                                            const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24) + 1);
                                            const daily = item.playTime / totalDays;
                                            const effStart = new Date(Math.max(startDate, currentMonthStart));
                                            const effEnd = new Date(Math.min(endDate, currentMonthEnd));
                                            const daysInMonth = (effEnd - effStart) / (1000 * 60 * 60 * 24) + 1;
                                            return { ...item, monthlyPlaytime: daily * daysInMonth };
                                        }
                                    }
                                } else {
                                    const startDate = new Date(item.purchaseDate);
                                    const endDate = new Date();
                                    if (!isNaN(startDate.getTime()) && startDate <= endDate) {
                                        if (startDate <= currentMonthEnd && endDate >= currentMonthStart) {
                                            const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24) + 1);
                                            const daily = (item.playTime || 0) / totalDays;
                                            const effStart = new Date(Math.max(startDate, currentMonthStart));
                                            const effEnd = new Date(Math.min(endDate, currentMonthEnd));
                                            const daysInMonth = (effEnd - effStart) / (1000 * 60 * 60 * 24) + 1;
                                            return { ...item, monthlyPlaytime: daily * daysInMonth };
                                        }
                                    }
                                }
                                return { ...item, monthlyPlaytime: 0 };
                            })
                            .filter(item => item.monthlyPlaytime > 0.01)
                            .sort((a, b) => b.monthlyPlaytime - a.monthlyPlaytime)
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-gray-600 pb-1">${month} 月报</div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">当月支出 Top 5</h4><ul class="text-sm">';
                        topCostItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${(item.name || '').substring(0, 20)}</span><strong>${formatCurrency(item.value)}</strong></li>`;
                        });
                        if (topCostItems.length === 0) html += '<li>无支出记录</li>';
                        html += '</ul>';

                        html += '<h4 class="font-semibold mt-2 mb-1">当月游玩 Top 5 (折算)</h4><ul class="text-sm">';
                        topTimeItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${(item.name || '').substring(0, 15)}</span><span class="flex items-center"><strong>${item.monthlyPlaytime.toFixed(1)}h</strong>${renderStars(item.rating)}</span></li>`;
                        });
                        if (topTimeItems.length === 0) html += '<li>无游玩记录</li>';
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    });
};
