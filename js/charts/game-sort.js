import { items, setChart, getChart } from '../core/state.js';
import { hashCode, renderStars, escapeHTML } from '../core/utils.js';
import { createExternalTooltip, destroyChartWithTooltip } from './setup.js';

export const renderGameSortChart = () => {
    const itemsWithSort = items.filter(i => i.type !== 'hardware' && i.sort && i.playTime > 0);
    const timeBySort = itemsWithSort.reduce((acc, item) => {
        const key = item.type === 'drama' ? `📺 ${item.sort}` : item.sort;
        acc[key] = (acc[key] || 0) + (item.playTime || 0);
        return acc;
    }, {});

    const sortedData = Object.entries(timeBySort).sort((a, b) => b[1] - a[1]);
    const labels = sortedData.map(d => d[0]);
    const data = sortedData.map(d => d[1]);
    const backgroundColors = labels.map(label => `hsl(${hashCode(label) % 360}, 30%, 55%)`);

    const el = document.getElementById('game-sort-chart');
    if (!el) return;

    if (getChart('gameSort')) destroyChartWithTooltip(getChart('gameSort'));

    setChart('gameSort', new Chart(el, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: backgroundColors, hoverOffset: 4 }]
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

                        const sortName = label.replace(/^📺 /, '');
                        const isDrama = label.startsWith('📺 ');
                        const topItems = items
                            .filter(i => i.sort === sortName && (isDrama ? i.type === 'drama' : i.type !== 'drama') && i.playTime > 0)
                            .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                            .slice(0, 3);

                        let html = `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1 flex justify-between"><span>${escapeHTML(label)}</span><span>${value.toFixed(1)}h (${percentage}%)</span></div>`;
                        html += `<h4 class="font-semibold mt-2 mb-1">该类型时长 Top 3</h4><ul class="text-sm">`;
                        topItems.forEach(item => {
                            html += `<li class="flex justify-between my-1"><span>${escapeHTML(item.name.substring(0, 15))}</span><span class="flex items-center"><strong>${(item.playTime || 0).toFixed(1)}h</strong>${renderStars(item.rating)}</span></li>`;
                        });
                        if (topItems.length === 0) html += '<li>无记录</li>';
                        html += '</ul>';
                        return html;
                    })
                }
            }
        }
    });
};
