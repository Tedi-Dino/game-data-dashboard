import { items, charts } from '../core/state.js';
import { PLATFORM_COLORS, TIME_TYPE_MAP, TIME_COLOR_MAP } from '../config/constants.js';
import { escapeHTML } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

const TIME_LABELS = {
    physical: 'Switch', digital: 'Switch',
    steam: 'Steam', epic: 'Epic', ubi: 'Uplay', gog: 'GOG',
    ps: 'PlayStation', xbox: 'Xbox/MS', ms: 'Xbox/MS', appstore: 'App Store',
    googleplay: 'Google Play', emulator: '模拟器', other: 'Other',
    drama: '剧'
};

export const renderTimeDistributionChart = () => {
    const rawData = {};
    items.forEach(i => {
        const label = TIME_LABELS[i.type];
        if (label) rawData[label] = (rawData[label] || 0) + (i.playTime || 0);
    });
    const filteredData = Object.fromEntries(Object.entries(rawData).filter(([_, v]) => v > 0));
    const el = document.getElementById('time-distribution-chart');
    if (!el) return;

    if (charts.timeDistribution) charts.timeDistribution.destroy();

    charts.timeDistribution = new Chart(el, {
        type: 'doughnut',
        data: {
            labels: Object.keys(filteredData),
            datasets: [{
                data: Object.values(filteredData),
                backgroundColor: Object.keys(filteredData).map(label => PLATFORM_COLORS[TIME_COLOR_MAP[label]]),
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
                            .filter(i => TIME_TYPE_MAP[label]?.includes(i.type))
                            .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                            .slice(0, 5);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1 flex justify-between"><span>${escapeHTML(label)}</span><span>${value.toFixed(1)}h (${percentage}%)</span></div>`;
                        html += '<h4 class="font-semibold mt-2 mb-1">时长 Top 5</h4><ul class="text-sm">';
                        topItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${escapeHTML(item.name.substring(0, 20))}</span><strong>${(item.playTime || 0).toFixed(1)}h</strong></li>`;
                        });
                        if (topItems.length === 0 || topItems.every(i => !(i.playTime > 0))) {
                            html += '<li>无游玩记录</li>';
                        }
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    });
};
