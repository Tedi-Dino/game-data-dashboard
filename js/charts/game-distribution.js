import { items, charts, gameDistributionMode } from '../core/state.js';
import { TIME_RANGES, PRICE_RANGES } from '../config/constants.js';
import { createExternalTooltip } from './setup.js';

export const renderGameDistributionChart = () => {
    const games = items.filter(i => i.type !== 'hardware');
    let labels = [];
    let data = [];

    if (gameDistributionMode === 'time') {
        labels = ['0-1h', '1-5h', '5-10h', '10-30h', '30-50h', '50-80h', '80h+'];
        const bins = Array(labels.length).fill(0);
        games.forEach(game => {
            const time = game.playTime || 0;
            for (let i = 0; i < TIME_RANGES.length; i++) {
                const [min, max] = TIME_RANGES[i];
                if (i === 0 ? (time >= min && time <= max) : (time > min && time <= max)) {
                    bins[i]++;
                    break;
                }
            }
        });
        data = bins;
    } else {
        labels = ['0-10', '10-30', '30-50', '50-80', '80-100', '100-200', '200+'];
        const bins = Array(labels.length).fill(0);
        games.forEach(game => {
            const cost = (game.purchasePrice || 0) - (game.sellPrice || 0);
            for (let i = 0; i < PRICE_RANGES.length; i++) {
                const [min, max] = PRICE_RANGES[i];
                if (i === 0 ? (cost >= min && cost <= max) : (cost > min && cost <= max)) {
                    bins[i]++;
                    break;
                }
            }
        });
        data = bins;
    }

    const el = document.getElementById('game-distribution-chart');
    if (!el) return;
    if (charts.gameDistribution) charts.gameDistribution.destroy();

    charts.gameDistribution = new Chart(el, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '游戏数量',
                data,
                backgroundColor: '#f97316',
                borderColor: '#fb923c',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(107, 114, 128, 0.5)' }, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        if (!tooltip.body || !tooltip.dataPoints.length) return null;
                        const dataPoint = tooltip.dataPoints[0];
                        const label = dataPoint.label;
                        const count = dataPoint.raw;
                        const index = dataPoint.dataIndex;
                        if (count === 0) return null;

                        let gameList = [];
                        if (gameDistributionMode === 'time') {
                            const [min, max] = TIME_RANGES[index];
                            gameList = games.filter(g => {
                                const time = g.playTime || 0;
                                return index === 0 ? (time >= min && time <= max) : (time > min && time <= max);
                            }).map(g => g.name);
                        } else {
                            const [min, max] = PRICE_RANGES[index];
                            gameList = games.filter(g => {
                                const cost = (g.purchasePrice || 0) - (g.sellPrice || 0);
                                return index === 0 ? (cost >= min && cost <= max) : (cost > min && cost <= max);
                            }).map(g => g.name);
                        }

                        let listHtml = gameList.slice(0, 10).map(name => `<li class="truncate">${name}</li>`).join('');
                        if (gameList.length > 10) listHtml += `<li class="text-gray-400">...等另外 ${gameList.length - 10} 款</li>`;

                        return `<div class="font-bold text-base mb-2 border-b border-gray-600 pb-1 flex justify-between">
                            <span>${label}</span><span>${count} 款</span>
                        </div>
                        <ul class="text-sm space-y-1">${listHtml || '<li>暂无游戏</li>'}</ul>`;
                    })
                }
            }
        }
    });
};
