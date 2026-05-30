import { items, setChart, getChart } from '../core/state.js';
import { PLATFORM_COLORS, COST_TYPE_MAP, COST_COLOR_MAP } from '../config/constants.js';
import { formatCurrency, escapeHTML, netCost } from '../core/utils.js';
import { createExternalTooltip, destroyChartWithTooltip } from './setup.js';

const COST_LABELS = {
    hardware: '硬件设备',
    physical: 'Switch 实体',
    digital: 'Switch 数字',
    steam: 'Steam 游戏',
    epic: 'Epic 游戏',
    ubi: 'Uplay 游戏',
    gog: 'GOG 游戏',
    ps: 'PlayStation 游戏',
    xbox: 'Xbox/MS 游戏',
    ms: 'Xbox/MS 游戏',
    appstore: 'App Store 游戏',
    googleplay: 'Google Play 游戏',
    emulator: '模拟器游戏',
    other: 'Other 游戏',
    drama: '剧'
};

export const renderCostDistributionChart = () => {
    const rawData = {};
    items.forEach(i => {
        const label = COST_LABELS[i.type];
        if (label) rawData[label] = (rawData[label] || 0) + netCost(i);
    });
    const sortedEntries = Object.entries(rawData).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const el = document.getElementById('cost-distribution-chart');
    if (!el) return;

    if (getChart('costDistribution')) destroyChartWithTooltip(getChart('costDistribution'));

    setChart('costDistribution', new Chart(el, {
        type: 'doughnut',
        data: {
            labels: sortedEntries.map(([l]) => l),
            datasets: [{
                data: sortedEntries.map(([_, v]) => v),
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
                        const value = tooltip.dataPoints[0].parsed;
                        const total = tooltip.dataPoints[0].dataset.data.reduce((a, b) => a + b, 0);
                        if (total === 0) return null;
                        const percentage = ((value / total) * 100).toFixed(1);

                        const topItems = items
                            .filter(i => COST_TYPE_MAP[label]?.includes(i.type))
                            .map(i => ({ name: i.name, value: netCost(i) }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1 flex justify-between"><span>${escapeHTML(label)}</span><span>${formatCurrency(value)} (${percentage}%)</span></div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">支出 Top 5</h4><ul class="text-sm">';
                        topItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${escapeHTML(item.name.substring(0, 20))}</span><strong>${formatCurrency(item.value)}</strong></li>`;
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
    }));
};
