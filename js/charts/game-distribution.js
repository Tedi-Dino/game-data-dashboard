import { items, charts, gameDistributionMode } from '../core/state.js';
import { TIME_RANGES, PRICE_RANGES } from '../config/constants.js';
import { escapeHTML } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

/** Count items into range bins using inclusive lower bound for bin 0, exclusive for all others. */
const binByRanges = (items, getValue, ranges) => {
    const bins = Array(ranges.length).fill(0);
    items.forEach(item => {
        const val = getValue(item);
        for (let i = 0; i < ranges.length; i++) {
            const [min, max] = ranges[i];
            if (i === 0 ? (val >= min && val <= max) : (val > min && val <= max)) {
                bins[i]++;
                break;
            }
        }
    });
    return bins;
};

export const renderGameDistributionChart = () => {
    const games = items.filter(i => i.type !== 'hardware' && i.type !== 'drama');
    const dramas = items.filter(i => i.type === 'drama');

    const isTimeMode = gameDistributionMode === 'time';
    const ranges = isTimeMode ? TIME_RANGES : PRICE_RANGES;
    const labels = isTimeMode
        ? ['0-1h', '1-5h', '5-10h', '10-30h', '30-50h', '50-80h', '80h+']
        : ['0-10', '10-30', '30-50', '50-80', '80-100', '100-200', '200+'];
    const getValue = isTimeMode
        ? (item) => item.playTime || 0
        : (item) => (item.purchasePrice || 0) - (item.sellPrice || 0);

    const gameData = binByRanges(games, getValue, ranges);
    const dramaData = binByRanges(dramas, getValue, ranges);

    const el = document.getElementById('game-distribution-chart');
    if (!el) return;
    if (charts.gameDistribution) charts.gameDistribution.destroy();

    charts.gameDistribution = new Chart(el, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '游戏数量',
                    data: gameData,
                    backgroundColor: '#d97706',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: '剧集数量',
                    data: dramaData,
                    backgroundColor: '#e11d48',
                    borderColor: '#f43f5e',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.06)' }, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        if (!tooltip.body || !tooltip.dataPoints.length) return null;
                        const dataPoint = tooltip.dataPoints[0];
                        const label = dataPoint.label;
                        const index = dataPoint.dataIndex;
                        const datasetIndex = dataPoint.datasetIndex;
                        const isDrama = datasetIndex === 1;
                        const sourceItems = isDrama ? dramas : games;
                        const count = dataPoint.raw;
                        if (count === 0) return null;

                        const [min, max] = ranges[index];
                        const itemList = sourceItems.filter(g => {
                            const val = getValue(g);
                            return index === 0 ? (val >= min && val <= max) : (val > min && val <= max);
                        }).map(g => g.name);

                        const icon = isDrama ? '📺' : '🎮';
                        const unit = isDrama ? '部' : '款';
                        let listHtml = itemList.slice(0, 10).map(name => `<li class="truncate">${escapeHTML(name)}</li>`).join('');
                        if (itemList.length > 10) listHtml += `<li class="text-stone-400">...等另外 ${itemList.length - 10} ${unit}</li>`;

                        return `<div class="font-bold text-base mb-2 border-b border-stone-200 pb-1 flex justify-between">
                            <span>${icon} ${escapeHTML(label)}</span><span>${count} ${unit}</span>
                        </div>
                        <ul class="text-sm space-y-1">${listHtml || `<li>暂无${isDrama ? '剧集' : '游戏'}</li>`}</ul>`;
                    })
                }
            }
        }
    });
};
