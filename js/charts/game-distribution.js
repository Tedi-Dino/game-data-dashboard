import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS } from '../config/constants.js';
import { escapeHTML, formatCurrency, netCost } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

// Platform grouping: item.type → display label + color key
const PLATFORM_MAP = {
    physical:  { label: 'Switch',       colorKey: 'switch_physical' },
    digital:   { label: 'Switch',       colorKey: 'switch_digital' },
    steam:     { label: 'Steam',        colorKey: 'steam' },
    epic:      { label: 'Epic',         colorKey: 'epic' },
    ubi:       { label: 'Uplay',        colorKey: 'ubi' },
    gog:       { label: 'GOG',          colorKey: 'gog' },
    ps:        { label: 'PlayStation',  colorKey: 'ps' },
    xbox:      { label: 'Xbox/MS',      colorKey: 'xbox' },
    ms:        { label: 'Xbox/MS',      colorKey: 'xbox' },
    appstore:  { label: 'App Store',    colorKey: 'appstore' },
    googleplay:{ label: 'Google Play',  colorKey: 'googleplay' },
    emulator:  { label: '模拟器',       colorKey: 'emulator' },
    other:     { label: 'Other',        colorKey: 'other' },
    drama:     { label: '剧集',         colorKey: 'drama' },
};

// Rating → point radius (unrated=2, rated 1–5 → 3–6)
const ratingToRadius = (rating) => {
    if (!rating || rating <= 0) return 2;
    return 2 + rating; // 1→3, 2→4, 3→5, 4→6, 5→7
};

export const renderGameDistributionChart = () => {
    const excludeUnsoldPhysical = document.getElementById('exclude-unsold-physical-checkbox')?.checked ?? false;
    const filtered = items.filter(i => {
        if (i.type === 'hardware') return false;
        if (excludeUnsoldPhysical && i.type === 'physical' && !i.sellDate) return false;
        return (i.playTime || 0) > 0 && (i.purchasePrice || 0) > 0;
    });

    // Group by platform
    const groups = {};
    filtered.forEach(item => {
        const map = PLATFORM_MAP[item.type];
        if (!map) return;
        if (!groups[map.label]) {
            groups[map.label] = { colorKey: map.colorKey, points: [] };
        }
        groups[map.label].points.push({
            x: item.playTime || 0,
            y: netCost(item),
            name: item.name,
            type: item.type,
            rating: item.rating || 0,
            from: item.from,
            purchasePrice: item.purchasePrice || 0,
            sellPrice: item.sellPrice || 0,
        });
    });

    // Build datasets sorted by label for stable legend order
    const datasets = Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, { colorKey, points }]) => {
            const color = PLATFORM_COLORS[colorKey] || '#9ca3af';
            return {
                label,
                data: points,
                backgroundColor: color + 'B3',
                borderColor: color,
                borderWidth: 1,
                pointRadius: points.map(p => ratingToRadius(p.rating)),
                pointHoverRadius: points.map(p => ratingToRadius(p.rating) + 2),
            };
        });

    const el = document.getElementById('game-distribution-chart');
    if (!el) return;
    if (charts.gameDistribution) charts.gameDistribution.destroy();

    charts.gameDistribution = new Chart(el, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: '游戏时长 (h)' },
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                y: {
                    title: { display: true, text: '实际花费 (¥)' },
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: (v) => '¥' + v },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        const pt = tooltip.dataPoints?.[0]?.raw;
                        if (!pt) return null;
                        const icon = pt.type === 'drama' ? '📺' : '🎮';
                        const stars = pt.rating > 0
                            ? ' ' + '★'.repeat(pt.rating) + '☆'.repeat(5 - pt.rating)
                            : '';
                        let html = `<div class="font-bold text-base mb-1">${icon} ${escapeHTML(pt.name)}</div>` +
                            `<div class="text-sm">时长: <strong>${pt.x.toFixed(1)}h</strong></div>` +
                            `<div class="text-sm">实际花费: <strong>${formatCurrency(pt.y)}</strong></div>`;
                        if (pt.sellPrice > 0) {
                            html += `<div class="text-xs text-stone-500">购入 ${formatCurrency(pt.purchasePrice)} - 回血 ${formatCurrency(pt.sellPrice)}</div>`;
                        }
                        if (stars) html += `<div class="text-sm mt-1">${stars}</div>`;
                        return html;
                    }),
                },
            },
        },
    });
};
