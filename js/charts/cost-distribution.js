import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS, COST_TYPE_MAP, COST_COLOR_MAP } from '../config/constants.js';
import { formatCurrency } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

const costReducer = (sum, i) => sum + (i.purchasePrice || 0) - (i.sellPrice || 0);

export const renderCostDistributionChart = () => {
    const data = {
        '硬件设备': items.filter(i => i.type === 'hardware').reduce(costReducer, 0),
        'Switch 实体': items.filter(i => i.type === 'physical').reduce(costReducer, 0),
        'Switch 数字': items.filter(i => i.type === 'digital').reduce(costReducer, 0),
        'Steam 游戏': items.filter(i => i.type === 'steam').reduce(costReducer, 0),
        'Epic 游戏': items.filter(i => i.type === 'epic').reduce(costReducer, 0),
        'Uplay 游戏': items.filter(i => i.type === 'ubi').reduce(costReducer, 0),
        'GOG 游戏': items.filter(i => i.type === 'gog').reduce(costReducer, 0),
        'PlayStation 游戏': items.filter(i => i.type === 'ps').reduce(costReducer, 0),
        'Xbox/MS 游戏': items.filter(i => i.type === 'xbox').reduce(costReducer, 0),
        'App Store 游戏': items.filter(i => i.type === 'appstore').reduce(costReducer, 0),
        'Google Play 游戏': items.filter(i => i.type === 'googleplay').reduce(costReducer, 0),
        '模拟器游戏': items.filter(i => i.type === 'emulator').reduce(costReducer, 0),
        'Other 游戏': items.filter(i => i.type === 'other').reduce(costReducer, 0)
    };

    const filteredData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v > 0));
    const el = document.getElementById('cost-distribution-chart');
    if (!el) return;

    if (charts.costDistribution) charts.costDistribution.destroy();

    charts.costDistribution = new Chart(el, {
        type: 'doughnut',
        data: {
            labels: Object.keys(filteredData),
            datasets: [{
                data: Object.values(filteredData),
                backgroundColor: Object.keys(filteredData).map(label => PLATFORM_COLORS[COST_COLOR_MAP[label]]),
                hoverOffset: 4
            }]
        },
        options: {
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
                            .map(i => ({ name: i.name, value: (i.purchasePrice || 0) - (i.sellPrice || 0) }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-gray-600 pb-1 flex justify-between"><span>${label}</span><span>${formatCurrency(value)} (${percentage}%)</span></div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">支出 Top 5</h4><ul class="text-sm">';
                        topItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${item.name.substring(0, 20)}</span><strong>${formatCurrency(item.value)}</strong></li>`;
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
    });
};
