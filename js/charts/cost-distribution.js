import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS } from '../config/constants.js';
import { formatCurrency, escapeHTML, netCost } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

const TYPE_COLOR_KEY = {
    hardware: 'hardware',
    physical: 'switch_physical',
    digital: 'switch_digital',
    steam: 'steam',
    epic: 'epic',
    ubi: 'ubi',
    gog: 'gog',
    ps: 'ps',
    xbox: 'xbox',
    ms: 'xbox',
    appstore: 'appstore',
    googleplay: 'googleplay',
    emulator: 'emulator',
    other: 'other'
};

const TYPE_LABEL = {
    hardware: '硬件设备',
    physical: 'Switch 实体',
    digital: 'Switch 数字',
    steam: 'Steam',
    epic: 'Epic',
    ubi: 'Uplay',
    gog: 'GOG',
    ps: 'PlayStation',
    xbox: 'Xbox/MS',
    ms: 'Xbox/MS',
    appstore: 'App Store',
    googleplay: 'Google Play',
    emulator: '模拟器',
    other: 'Other'
};

export const renderCostDistributionChart = () => {
    const el = document.getElementById('cost-distribution-chart');
    if (!el) return;

    if (charts.costDistribution) charts.costDistribution.destroy();

    // Filter out drama and items without purchase date or with zero/missing cost
    const points = items
        .filter(i => i.type !== 'drama' && i.purchaseDate && netCost(i) > 0)
        .map(i => ({
            x: new Date(i.purchaseDate).getTime(),
            y: netCost(i),
            name: i.name,
            type: i.type,
            label: TYPE_LABEL[i.type] || i.type,
            colorKey: TYPE_COLOR_KEY[i.type] || 'other'
        }))
        .sort((a, b) => a.x - b.x);

    // Group by type label for legend
    const groups = {};
    points.forEach(p => {
        if (!groups[p.label]) groups[p.label] = { points: [], colorKey: p.colorKey };
        groups[p.label].points.push(p);
    });

    const datasets = Object.entries(groups).map(([label, { points: pts, colorKey }]) => ({
        label,
        data: pts,
        backgroundColor: PLATFORM_COLORS[colorKey] + 'B3',
        borderColor: PLATFORM_COLORS[colorKey],
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7
    }));

    charts.costDistribution = new Chart(el, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: '购买日期' },
                    ticks: {
                        callback: (v) => {
                            const d = new Date(v);
                            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                        },
                        maxTicksLimit: 10
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    title: { display: true, text: '净花费 (¥)' },
                    beginAtZero: true,
                    ticks: { callback: (v) => '¥' + v },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, pointStyle: 'circle', padding: 12 }
                },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        const pt = tooltip.dataPoints?.[0]?.raw;
                        if (!pt) return null;
                        const d = new Date(pt.x);
                        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        return `<div class="font-bold text-base mb-1">${escapeHTML(pt.name)}</div>` +
                            `<div class="flex justify-between text-sm"><span>${escapeHTML(pt.label)}</span><span>${dateStr}</span></div>` +
                            `<div class="font-bold text-lg mt-1 text-right">${formatCurrency(pt.y)}</div>`;
                    })
                }
            }
        }
    });
};
