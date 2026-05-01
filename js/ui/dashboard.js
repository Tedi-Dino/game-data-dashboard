import { items } from '../core/state.js';
import { formatCurrency } from '../core/utils.js';

// --- KPI Calculations ---
const calcKPIs = () => {
    const games = items.filter(i => i.type !== 'hardware');
    const hardware = items.filter(i => i.type === 'hardware');
    const gamesForCostCalc = games.filter(g => g.from !== 'free');

    const totalActual = items.reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const gameActual = games.reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const hardwareActual = hardware.reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const unfinishedCost = games.filter(g => g.status !== 'passed').reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const totalPlaytime = games.reduce((s, i) => s + (i.playTime || 0), 0);
    const gameCount = games.length;
    const avgPlaytime = gameCount > 0 ? totalPlaytime / gameCount : 0;
    const gameActualForCost = gamesForCostCalc.reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const totalPlaytimeForCost = gamesForCostCalc.reduce((s, i) => s + (i.playTime || 0), 0);
    const costPerHour = totalPlaytimeForCost > 0 ? gameActualForCost / totalPlaytimeForCost : null;

    return { totalActual, gameActual, hardwareActual, unfinishedCost, totalPlaytime, gameCount, avgPlaytime, costPerHour };
};

// --- Update KPI DOM Elements ---
export const updateDashboardKPIs = () => {
    const kpi = calcKPIs();

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('total-actual-cost', formatCurrency(kpi.totalActual));
    setText('game-actual-cost', formatCurrency(kpi.gameActual));
    setText('hardware-actual-cost', formatCurrency(kpi.hardwareActual));
    setText('unfinished-games-cost', formatCurrency(kpi.unfinishedCost));
    setText('total-games', `${kpi.gameCount} 款`);
    setText('total-playtime', `${kpi.totalPlaytime.toFixed(2)} 小时`);
    setText('avg-playtime', `${kpi.avgPlaytime.toFixed(2)} 小时/款`);
    setText('cost-per-hour', kpi.costPerHour !== null ? formatCurrency(kpi.costPerHour) : '/');
};

// --- Update KPI Tooltips ---
export const updateKpiTooltips = () => {
    const games = items.filter(i => i.type !== 'hardware');

    // Game cost top 10
    const topCost = [...games]
        .sort((a, b) => ((b.purchasePrice || 0) - (b.sellPrice || 0)) - ((a.purchasePrice || 0) - (a.sellPrice || 0)))
        .slice(0, 10);
    const gameCostTooltip = document.getElementById('game-cost-tooltip');
    if (gameCostTooltip) {
        gameCostTooltip.innerHTML = '<h3 class="font-bold mb-1">游戏支出 Top 10</h3><ul>' +
            topCost.map(g => `<li class="flex justify-between"><span>${g.name.substring(0, 18)}</span><strong>${formatCurrency((g.purchasePrice || 0) - (g.sellPrice || 0))}</strong></li>`).join('') + '</ul>';
    }

    // Playtime top 10
    const topPlay = [...games].sort((a, b) => (b.playTime || 0) - (a.playTime || 0)).slice(0, 10);
    const playtimeTooltip = document.getElementById('playtime-tooltip');
    if (playtimeTooltip) {
        playtimeTooltip.innerHTML = '<h3 class="font-bold mb-1">游玩时长 Top 10</h3><ul>' +
            topPlay.map(g => `<li class="flex justify-between"><span>${g.name.substring(0, 18)}</span><strong>${(g.playTime || 0).toFixed(1)}h</strong></li>`).join('') + '</ul>';
    }

    // Cost per hour (most & least expensive)
    const gamesCph = games
        .filter(g => g.playTime > 0 && g.from !== 'free')
        .map(g => ({ ...g, cph: ((g.purchasePrice || 0) - (g.sellPrice || 0)) / g.playTime }));
    const cheapest = [...gamesCph].sort((a, b) => a.cph - b.cph).slice(0, 5);
    const mostExpensive = [...gamesCph].sort((a, b) => b.cph - a.cph).slice(0, 5);
    const cphTooltip = document.getElementById('cph-tooltip');
    if (cphTooltip) {
        cphTooltip.innerHTML =
            '<h3 class="font-bold mb-1">最高时间成本 Top 5</h3><ul>' +
            mostExpensive.map(g => `<li class="flex justify-between"><span>${g.name.substring(0, 20)}</span><strong>${formatCurrency(g.cph)}/h</strong></li>`).join('') +
            '</ul><h3 class="font-bold mt-2 mb-1">最低时间成本 Top 5</h3><ul>' +
            cheapest.map(g => `<li class="flex justify-between"><span>${g.name.substring(0, 20)}</span><strong>${formatCurrency(g.cph)}/h</strong></li>`).join('') + '</ul>';
    }

    // Unfinished games value
    const unfinishedGames = games.filter(g => g.status !== 'passed');
    const unfinishedPhysical = unfinishedGames.filter(g => g.type === 'physical').reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const unfinishedDigital = unfinishedGames.filter(g => !['physical', 'hardware'].includes(g.type)).reduce((s, i) => s + (i.purchasePrice || 0) - (i.sellPrice || 0), 0);
    const topUnfinished = [...unfinishedGames].sort((a, b) => ((b.purchasePrice || 0) - (b.sellPrice || 0)) - ((a.purchasePrice || 0) - (a.sellPrice || 0))).slice(0, 5);
    const unfinishedTooltip = document.getElementById('unfinished-cost-tooltip');
    if (unfinishedTooltip) {
        let html = `<div class="grid grid-cols-2 gap-1 mb-2"><div>实体: <strong>${formatCurrency(unfinishedPhysical)}</strong></div><div>数字: <strong>${formatCurrency(unfinishedDigital)}</strong></div></div>`;
        html += '<h3 class="font-bold mt-2 mb-1 border-t border-gray-600 pt-1">最贵未通关 Top 5</h3><ul>';
        html += topUnfinished.map(g => `<li class="flex justify-between"><span>${g.name.substring(0, 20)}</span><strong>${formatCurrency((g.purchasePrice || 0) - (g.sellPrice || 0))}</strong></li>`).join('');
        if (topUnfinished.length === 0) html += '<li>无</li>';
        html += '</ul>';
        unfinishedTooltip.innerHTML = html;
    }

    // Game count by platform
    const gameCountByType = {
        'Switch': items.filter(i => ['physical', 'digital'].includes(i.type)).length,
        'Steam': items.filter(i => i.type === 'steam').length,
        'Epic': items.filter(i => i.type === 'epic').length,
        'Uplay': items.filter(i => i.type === 'ubi').length,
        'GOG': items.filter(i => i.type === 'gog').length,
        'PlayStation': items.filter(i => i.type === 'ps').length,
        'Xbox/MS': items.filter(i => i.type === 'xbox').length,
        'App Store': items.filter(i => i.type === 'appstore').length,
        'Google Play': items.filter(i => i.type === 'googleplay').length,
        '模拟器': items.filter(i => i.type === 'emulator').length,
        'Other': items.filter(i => i.type === 'other').length
    };

    const sortedGameCount = Object.entries(gameCountByType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    const totalGamesTooltip = document.getElementById('total-games-tooltip');
    if (totalGamesTooltip) {
        totalGamesTooltip.innerHTML = '<h3 class="font-bold mb-1">各平台游戏数量</h3><ul>' +
            sortedGameCount.map(([platform, count]) => `<li class="flex justify-between"><span>${platform}</span><strong>${count} 款</strong></li>`).join('') + '</ul>';
    }
};

// --- Smart Tooltip Positioning ---
// Detects viewport edges on hover and flips/shifts tooltip so it stays fully visible.

let tooltipSetupDone = false;

export const setupKpiTooltips = () => {
    if (tooltipSetupDone) return;
    tooltipSetupDone = true;

    const tooltips = document.querySelectorAll('.kpi-tooltip');
    tooltips.forEach(tooltip => {
        const trigger = tooltip.closest('.group');
        if (!trigger) return;

        trigger.addEventListener('mouseenter', () => {
            const rect = tooltip.getBoundingClientRect();
            // rect is stale (tooltip is opacity:0, so size is 0).
            // Force a temporary display to measure.
            const prevOpacity = tooltip.style.opacity;
            const prevPointerEvents = tooltip.style.pointerEvents;
            tooltip.style.opacity = '1';
            tooltip.style.pointerEvents = 'none';

            // Measure at each possible position
            const aboveRect = getRectAt(tooltip, 'above');
            const belowRect = getRectAt(tooltip, 'below');

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const pad = 8; // px padding from viewport edge

            // Decide vertical: prefer above unless it would overflow top
            let useBelow = false;
            if (aboveRect.top < pad) {
                useBelow = true;
            }
            // If below would overflow bottom but above fits, stay above
            if (belowRect.bottom > vh - pad && aboveRect.top >= pad) {
                useBelow = false;
            }
            // Last resort: if both overflow, pick the one with more room
            if (aboveRect.top < pad && belowRect.bottom > vh - pad) {
                useBelow = (vh - belowRect.bottom) > (aboveRect.top);
            }

            // Decide horizontal: right-align if it overflows right edge
            let useRight = false;
            const targetRect = useBelow ? belowRect : aboveRect;
            if (targetRect.right > vw - pad) {
                useRight = true;
            }
            // But if left-aligned fits better than right-aligned...
            // (only check if right-aligned would overflow left)
            if (useRight) {
                const rightRect = getRectAt(tooltip, useBelow ? 'below-right' : 'above-right');
                if (rightRect.left < pad) {
                    useRight = false; // keep left-aligned
                }
            }

            // Apply classes
            tooltip.classList.remove('kpi-tooltip-above', 'kpi-tooltip-below', 'kpi-tooltip-right');
            tooltip.classList.add(useBelow ? 'kpi-tooltip-below' : 'kpi-tooltip-above');
            if (useRight) tooltip.classList.add('kpi-tooltip-right');

            // Restore
            tooltip.style.opacity = prevOpacity;
            tooltip.style.pointerEvents = prevPointerEvents;
        });
    });
};

// Helper: simulate tooltip position and return its bounding rect
function getRectAt(tooltip, position) {
    // Save current classes
    const hadAbove = tooltip.classList.contains('kpi-tooltip-above');
    const hadBelow = tooltip.classList.contains('kpi-tooltip-below');
    const hadRight = tooltip.classList.contains('kpi-tooltip-right');

    tooltip.classList.remove('kpi-tooltip-above', 'kpi-tooltip-below', 'kpi-tooltip-right');

    switch (position) {
        case 'above':
            tooltip.classList.add('kpi-tooltip-above');
            break;
        case 'below':
            tooltip.classList.add('kpi-tooltip-below');
            break;
        case 'above-right':
            tooltip.classList.add('kpi-tooltip-above', 'kpi-tooltip-right');
            break;
        case 'below-right':
            tooltip.classList.add('kpi-tooltip-below', 'kpi-tooltip-right');
            break;
    }

    const rect = tooltip.getBoundingClientRect();

    // Restore
    tooltip.classList.remove('kpi-tooltip-above', 'kpi-tooltip-below', 'kpi-tooltip-right');
    if (hadAbove) tooltip.classList.add('kpi-tooltip-above');
    if (hadBelow) tooltip.classList.add('kpi-tooltip-below');
    if (hadRight) tooltip.classList.add('kpi-tooltip-right');

    return rect;
}
