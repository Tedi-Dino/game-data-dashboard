import { items } from '../core/state.js';
import { PLATFORM_META, PLATFORM_COLORS, TIME_LABEL_BY_TYPE } from '../config/constants.js';
import { escapeHTML, formatCurrency, netCost, renderStars, effectiveRemarks, isUnsoldPhysical, UNSOLD_PHYSICAL_ESTIMATE_REMARK } from '../core/utils.js';
import { createExternalTooltip, renderOrUpdateChart, setChartEmptyState } from './setup.js';

// Platform grouping: item.type -> display label + color key.
// Derived from PLATFORM_META instead of a local copy — the local copy had already
// drifted (drama was '剧集' here vs '剧' everywhere else).
const PLATFORM_MAP = Object.fromEntries(
    PLATFORM_META
        .filter(p => p.timeLabel)
        .map(p => [p.type, { label: p.timeLabel, colorKey: p.colorKey }])
);

// Rating → point radius (unrated=2, rated 1→2.2, 5→3, 10→4)
const ratingToRadius = (rating) => {
    if (!rating || rating <= 0) return 2;
    return 2 + rating * 0.2;
};

// Scriptable radius function for Chart.js (receives context)
const radiusFromContext = (ctx) => {
    const rating = ctx.raw?.rating || 0;
    return ratingToRadius(rating);
};

export const renderGameDistributionChart = () => {
    const physicalCostMode = document.getElementById('physical-cost-mode-select')?.value || 'estimated';
    const useEstimatedPhysicalCost = physicalCostMode !== 'actual';
    const chartCost = (item) => {
        if (isUnsoldPhysical(item) && !useEstimatedPhysicalCost) {
            return item.purchasePrice || 0;
        }
        return netCost(item);
    };

    const filtered = items.filter(i => {
        if (i.type === 'hardware') return false;
        return (i.playTime || 0) > 0 && chartCost(i) !== 0;
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
            y: chartCost(item),
            name: item.name,
            type: item.type,
            rating: item.rating || 0,
            from: item.from,
            purchasePrice: item.purchasePrice || 0,
            sellPrice: item.sellPrice || 0,
            remarks: useEstimatedPhysicalCost ? effectiveRemarks(item) : (item.remarks === UNSOLD_PHYSICAL_ESTIMATE_REMARK ? '' : (item.remarks || '')),
            isEstimatedCost: isUnsoldPhysical(item) && useEstimatedPhysicalCost,
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
                borderColor: '#ffffff',
                borderWidth: 1,
                pointRadius: radiusFromContext,
                pointHoverRadius: (ctx) => radiusFromContext(ctx) + 1.5,
                pointHitRadius: 12,
            };
        });

    // Glow datasets for high-rated games (rating >= 8) — subtle halo
    const glowDatasets = Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, { colorKey, points }]) => {
            const highRated = points.filter(p => (p.rating || 0) >= 8);
            if (highRated.length === 0) return null;
            const color = PLATFORM_COLORS[colorKey] || '#9ca3af';
            return {
                label: '',
                data: highRated,
                backgroundColor: color + '30',
                borderWidth: 0,
                pointRadius: (ctx) => {
                    const rating = ctx.raw?.rating || 0;
                    return ratingToRadius(rating) + 3;
                },
                pointHoverRadius: (ctx) => {
                    const rating = ctx.raw?.rating || 0;
                    return ratingToRadius(rating) + 4;
                },
                pointHitRadius: 0,
            };
        })
        .filter(Boolean);

    const allDatasets = [...datasets, ...glowDatasets];

    const el = document.getElementById('game-distribution-chart');
    if (!el) return;
    setChartEmptyState('game-distribution-empty', filtered.length === 0);
    el.setAttribute?.('aria-label', filtered.length
        ? `价格与游玩时长的散点分布图，共 ${filtered.length} 款游戏`
        : '价格与游玩时长的散点分布图：暂无已游玩数据');
    // No `view` argument needed: the tooltip formatter reads everything off the
    // raw data point (`pt`) and the live `items` import.
    renderOrUpdateChart('gameDistribution', el, {
        type: 'scatter',
        data: { datasets: allDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
            },
            scales: {
                x: {
                    title: { display: true, text: '游戏时长 (h)' },
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                y: {
                    title: { display: true, text: useEstimatedPhysicalCost ? '净花费 (¥，未售实体按30元预估)' : '实际净花费 (¥)' },
                    // Negative net cost is meaningful (sold for more than paid). Keep
                    // the scale automatic instead of clipping those points at zero.
                    beginAtZero: false,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: (v) => '¥' + Math.round(v) },
                },
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        const pt = tooltip.dataPoints?.[0]?.raw;
                        if (!pt) return null;
                        const icon = pt.type === 'drama' ? '📺' : '🎮';
                        const stars = renderStars(pt.rating, false);
                        const meta = PLATFORM_META.find(p => p.type === pt.type);
                        const platformLabel = meta?.label || TIME_LABEL_BY_TYPE[pt.type] || '其他';
                        const platformColor = PLATFORM_COLORS[meta?.colorKey] || '#9ca3af';
                        let html = `<div class="font-bold text-base mb-1">${icon} ${escapeHTML(pt.name || '')}</div>` +
                            `<div class="text-xs text-stone-500 mb-1"><span class="inline-block w-2 h-2 rounded-full mr-1 align-middle" style="background-color:${platformColor}"></span>${escapeHTML(platformLabel)}</div>` +
                            `<div class="text-sm">时长: <strong>${pt.x.toFixed(1)}h</strong></div>` +
                            `<div class="text-sm">${pt.isEstimatedCost ? '估算净花费' : '实际净花费'}: <strong>${formatCurrency(pt.y)}</strong></div>`;
                        if (pt.sellPrice > 0) {
                            html += `<div class="text-xs text-stone-500">购入 ${formatCurrency(pt.purchasePrice)} - 回血 ${formatCurrency(pt.sellPrice)}</div>`;
                        }
                        if (pt.remarks) {
                            html += `<div class="text-xs text-amber-600 mt-1">📝 ${escapeHTML(pt.remarks)}</div>`;
                        }
                        if (stars) html += `<div class="text-sm mt-1">${stars}</div>`;
                        return html;
                    }),
                },
            },
        },
    });
};
