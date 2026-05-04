import { items, charts, gameDistributionMode } from '../core/state.js';
import { escapeHTML, formatCurrency } from '../core/utils.js';
import { createExternalTooltip } from './setup.js';

// Deterministic jitter from string hash → value in [0.1, 0.9]
const jitter = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return 0.1 + (Math.abs(h) % 1000) / 1000 * 0.8;
};

export const renderGameDistributionChart = () => {
    const excludeUnsoldPhysical = document.getElementById('exclude-unsold-physical-checkbox')?.checked ?? false;
    const games = items.filter(i => {
        if (i.type === 'hardware' || i.type === 'drama') return false;
        if (excludeUnsoldPhysical && i.type === 'physical' && !i.sellDate) return false;
        return true;
    });
    const dramas = items.filter(i => i.type === 'drama');

    const isTimeMode = gameDistributionMode === 'time';
    const getValue = isTimeMode
        ? (item) => item.playTime || 0
        : (item) => (item.purchasePrice || 0) - (item.sellPrice || 0);

    const makePoints = (sourceItems) => sourceItems
        .filter(item => getValue(item) > 0)
        .map(item => ({
            x: getValue(item),
            y: jitter(item.name + item.type),
            name: item.name,
            type: item.type
        }));

    const gamePoints = makePoints(games);
    const dramaPoints = makePoints(dramas);

    const el = document.getElementById('game-distribution-chart');
    if (!el) return;
    if (charts.gameDistribution) charts.gameDistribution.destroy();

    charts.gameDistribution = new Chart(el, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '游戏',
                    data: gamePoints,
                    backgroundColor: '#d97706B3',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: '剧集',
                    data: dramaPoints,
                    backgroundColor: '#e11d48B3',
                    borderColor: '#f43f5e',
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: isTimeMode ? '游戏时长 (h)' : '净花费 (¥)' },
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: isTimeMode ? {} : { callback: (v) => '¥' + v }
                },
                y: { display: false, min: 0, max: 1 }
            },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    enabled: false,
                    external: createExternalTooltip((tooltip) => {
                        const pt = tooltip.dataPoints?.[0]?.raw;
                        if (!pt) return null;
                        const icon = pt.type === 'drama' ? '📺' : '🎮';
                        const valueStr = isTimeMode
                            ? `${pt.x.toFixed(1)}h`
                            : formatCurrency(pt.x);
                        return `<div class="font-bold text-base mb-1">${icon} ${escapeHTML(pt.name)}</div>` +
                            `<div class="text-sm font-semibold">${valueStr}</div>`;
                    })
                }
            }
        }
    });
};
