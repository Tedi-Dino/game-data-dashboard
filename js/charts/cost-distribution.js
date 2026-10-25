import { items } from '../core/state.js';
import { PLATFORM_COLORS, COST_TYPE_MAP, COST_COLOR_MAP, COST_LABEL_BY_TYPE } from '../config/constants.js';
import { formatCurrency, escapeHTML, netCost } from '../core/utils.js';
import { createExternalTooltip, renderOrUpdateChart, setChartEmptyState } from './setup.js';

export const renderCostDistributionChart = () => {
    const rawData = {};
    items.forEach(i => {
        const label = COST_LABEL_BY_TYPE[i.type];
        if (label) rawData[label] = (rawData[label] || 0) + netCost(i);
    });
    // Keep platforms whose net cost is NEGATIVE (sold for more than paid): they
    // still belong to the KPI total, so hiding them made the ring not add up.
    const sortedEntries = Object.entries(rawData).filter(([_, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
    const el = document.getElementById('cost-distribution-chart');
    if (!el) return;
    setChartEmptyState('cost-distribution-empty', sortedEntries.length === 0);
    el.setAttribute?.('aria-label', sortedEntries.length
        ? `消费金额分布饼图：${sortedEntries.map(([label]) => label).join('、')}`
        : '消费金额分布饼图：暂无数据');

    // Denominator for percentages: sum of magnitudes, otherwise mixed signs
    // produce meaningless (and possibly infinite) shares.
    const absTotal = sortedEntries.reduce((sum, [_, v]) => sum + Math.abs(v), 0);

    // Refreshed on every render so the tooltip formatter — which is created
    // once and reused across updates — never reads stale numbers.
    const view = { sortedEntries, absTotal };

    renderOrUpdateChart('costDistribution', el, {
        type: 'doughnut',
        data: {
            labels: sortedEntries.map(([l]) => l),
            datasets: [{
                // A doughnut arc cannot encode a negative number — use the magnitude
                // for geometry and read the signed value back in the tooltip, so the
                // sectors still reconcile with the "actual spend" KPI.
                data: sortedEntries.map(([_, v]) => Math.abs(v)),
                backgroundColor: sortedEntries.map(([l]) => PLATFORM_COLORS[COST_COLOR_MAP[l]]),
                hoverOffset: 4
            }]
        },
        options: {
            rotation: 0,
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        if (!tooltip.body) return null;
                        const label = tooltip.title?.[0];
                        if (!label) return null;
                        // Read from the instance-level view: this callback is built
                        // once at construction, so closing over local vars would
                        // freeze the tooltip at the first render's numbers.
                        const { sortedEntries: entries, absTotal: total } = tooltip.chart.$view || {};
                        if (!entries) return null;
                        // Read the signed value — the chart data holds magnitudes.
                        const value = entries[tooltip.dataPoints[0].dataIndex]?.[1] ?? 0;
                        if (!total) return null;
                        const percentage = ((value / total) * 100).toFixed(1);

                        const topItems = items
                            .filter(i => COST_TYPE_MAP[label]?.includes(i.type))
                            .map(i => ({ name: i.name, value: netCost(i) }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1 flex justify-between"><span>${escapeHTML(label)}</span><span>${formatCurrency(value)} (${percentage}%)</span></div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">支出 Top 5</h4><ul class="text-sm">';
                        topItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${escapeHTML((item.name || '').substring(0, 20))}</span><strong>${formatCurrency(item.value)}</strong></li>`;
                        });
                        if (topItems.length === 0 || topItems.every(i => i.value === 0)) {
                            html += '<li>无支出记录</li>';
                        }
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    }, view);
};
