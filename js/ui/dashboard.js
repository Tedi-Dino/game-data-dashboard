import { items } from '../core/state.js';
import { formatCurrency, formatNumber, escapeHTML, netCost } from '../core/utils.js';

// --- KPI Calculations ---
const calcKPIs = () => {
    const games = items.filter(i => i.type !== 'hardware' && i.type !== 'drama');
    // Exclude items where user disabled Steam override (steam_override === false)
    const gamesForPlaytime = items.filter(i => i.type !== 'hardware' && i.type !== 'drama' && i.steam_override !== false);
    const hardware = items.filter(i => i.type === 'hardware');
    const dramas = items.filter(i => i.type === 'drama');
    const gamesForCostCalc = gamesForPlaytime.filter(g => g.from !== 'free');

    const totalActual = items.reduce((s, i) => s + netCost(i), 0);
    const gameActual = games.reduce((s, i) => s + netCost(i), 0);
    const hardwareActual = hardware.reduce((s, i) => s + netCost(i), 0);
    const unfinishedCost = games.filter(g => g.status !== 'passed').reduce((s, i) => s + netCost(i), 0);
    const totalPlaytime = gamesForPlaytime.reduce((s, i) => s + (i.playTime ?? 0), 0);
    const gameCount = games.length;
    const avgPlaytime = gamesForPlaytime.length > 0 ? totalPlaytime / gamesForPlaytime.length : 0;
    const gameActualForCost = gamesForCostCalc.reduce((s, i) => s + netCost(i), 0);
    const totalPlaytimeForCost = gamesForCostCalc.reduce((s, i) => s + (i.playTime ?? 0), 0);
    const costPerHour = totalPlaytimeForCost > 0 ? gameActualForCost / totalPlaytimeForCost : null;

    const dramaCount = dramas.length;
    const totalDramaTime = dramas.reduce((s, i) => s + (i.playTime ?? 0), 0);
    const avgDramaTime = dramaCount > 0 ? totalDramaTime / dramaCount : 0;
    const passedCount = games.filter(g => g.status === 'passed').length;
    const fullyCompletedCount = games.filter(g => g.fullyCompleted === true).length;

    return { totalActual, gameActual, hardwareActual, unfinishedCost, totalPlaytime, gameCount, avgPlaytime, costPerHour, dramaCount, totalDramaTime, avgDramaTime, passedCount, fullyCompletedCount };
};

// --- Update KPI DOM Elements ---
export const updateDashboardKPIs = () => {
    const kpi = calcKPIs();

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('total-actual-cost', formatNumber(kpi.totalActual));
    setText('game-actual-cost', formatNumber(kpi.gameActual));
    setText('hardware-actual-cost', formatNumber(kpi.hardwareActual));
    setText('unfinished-games-cost', formatNumber(kpi.unfinishedCost));
    setText('total-games', `${kpi.fullyCompletedCount} / ${kpi.passedCount} / ${kpi.gameCount}`);
    setText('total-playtime', kpi.totalPlaytime.toFixed(2));
    setText('avg-playtime', kpi.avgPlaytime.toFixed(2));
    setText('cost-per-hour', kpi.costPerHour !== null ? formatNumber(kpi.costPerHour) : '/');
    setText('total-dramas', kpi.dramaCount);
    setText('total-drama-time', kpi.totalDramaTime.toFixed(2));
    setText('avg-drama-time', kpi.avgDramaTime.toFixed(2));

    // Hide/show currency symbol for cost-per-hour when it's "/"
    const cphEl = document.getElementById('cost-per-hour');
    if (cphEl) {
        const currencySpan = cphEl.parentElement.querySelector('.kpi-currency');
        if (currencySpan) {
            currencySpan.style.display = kpi.costPerHour !== null ? '' : 'none';
        }
    }
};

// --- Update KPI Tooltips ---
export const updateKpiTooltips = () => {
    const games = items.filter(i => i.type !== 'hardware' && i.type !== 'drama');
    const dramas = items.filter(i => i.type === 'drama');

    // Game cost top 10
    const topCost = [...games]
        .sort((a, b) => netCost(b) - netCost(a))
        .slice(0, 10);
    const gameCostTooltip = document.getElementById('game-cost-tooltip');
    if (gameCostTooltip) {
        gameCostTooltip.innerHTML = '<h3 class="font-bold mb-1">游戏支出 Top 10</h3><ul>' +
            topCost.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 18))}</span><strong>${formatCurrency(netCost(g))}</strong></li>`).join('') + '</ul>';
    }

    // Playtime top 10 (games only)
    const topPlay = [...games].filter(i => (i.playTime ?? 0) > 0).sort((a, b) => (b.playTime || 0) - (a.playTime || 0)).slice(0, 10);
    const playtimeTooltip = document.getElementById('playtime-tooltip');
    if (playtimeTooltip) {
        playtimeTooltip.innerHTML = '<h3 class="font-bold mb-1">游玩时长 Top 10</h3><ul>' +
            topPlay.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 18))}</span><strong>${(g.playTime || 0).toFixed(1)}h</strong></li>`).join('') + '</ul>';
    }

    // Cost per hour (most & least expensive)
    const gamesCph = games
        .filter(g => g.playTime > 0 && g.from !== 'free')
        .map(g => ({ ...g, cph: netCost(g) / g.playTime }));
    const cheapest = [...gamesCph].sort((a, b) => a.cph - b.cph).slice(0, 5);
    const mostExpensive = [...gamesCph].sort((a, b) => b.cph - a.cph).slice(0, 5);
    const cphTooltip = document.getElementById('cph-tooltip');
    if (cphTooltip) {
        cphTooltip.innerHTML =
            '<h3 class="font-bold mb-1">最高时间成本 Top 5</h3><ul>' +
            mostExpensive.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 20))}</span><strong>${formatCurrency(g.cph)}/h</strong></li>`).join('') +
            '</ul><h3 class="font-bold mt-2 mb-1">最低时间成本 Top 5</h3><ul>' +
            cheapest.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 20))}</span><strong>${formatCurrency(g.cph)}/h</strong></li>`).join('') + '</ul>';
    }

    // Unfinished games value
    const unfinishedGames = games.filter(g => g.status !== 'passed');
    const unfinishedPhysical = unfinishedGames.filter(g => g.type === 'physical').reduce((s, i) => s + netCost(i), 0);
    const unfinishedDigital = unfinishedGames.filter(g => !['physical', 'hardware'].includes(g.type)).reduce((s, i) => s + netCost(i), 0);
    const topUnfinished = [...unfinishedGames].sort((a, b) => netCost(b) - netCost(a)).slice(0, 5);
    const unfinishedTooltip = document.getElementById('unfinished-cost-tooltip');
    if (unfinishedTooltip) {
        let html = `<div class="grid grid-cols-2 gap-1 mb-2"><div>实体: <strong>${formatCurrency(unfinishedPhysical)}</strong></div><div>数字: <strong>${formatCurrency(unfinishedDigital)}</strong></div></div>`;
        html += '<h3 class="font-bold mt-2 mb-1 border-t border-stone-200 pt-1">最贵未完成 Top 5</h3><ul>';
        html += topUnfinished.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 20))}</span><strong>${formatCurrency(netCost(g))}</strong></li>`).join('');
        if (topUnfinished.length === 0) html += '<li>无</li>';
        html += '</ul>';
        unfinishedTooltip.innerHTML = html;
    }

    // Game count by platform (games only, dramas have their own card)
    const TYPE_TO_PLATFORM = {
        physical: 'Switch', digital: 'Switch',
        steam: 'Steam', epic: 'Epic', ubi: 'Uplay', gog: 'GOG',
        ps: 'PlayStation', xbox: 'Xbox/MS', ms: 'Xbox/MS', appstore: 'App Store',
        googleplay: 'Google Play', emulator: '模拟器', other: 'Other'
    };
    const gameCountByType = {};
    games.forEach(i => {
        const platform = TYPE_TO_PLATFORM[i.type];
        if (platform) gameCountByType[platform] = (gameCountByType[platform] || 0) + 1;
    });

    const sortedGameCount = Object.entries(gameCountByType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    const totalGamesTooltip = document.getElementById('total-games-tooltip');
    if (totalGamesTooltip) {
        const passedGames = games.filter(g => g.status === 'passed');
        const fullyCompletedGames = games.filter(g => g.fullyCompleted === true);

        let html = '<div class="grid grid-cols-3 gap-3">';

        // Left: 全成就 by platform
        html += '<div><h3 class="font-bold mb-1 text-amber-600">全成就</h3>';
        const fcaPlatform = {};
        fullyCompletedGames.forEach(i => {
            const p = TYPE_TO_PLATFORM[i.type] || 'Other';
            fcaPlatform[p] = (fcaPlatform[p] || 0) + 1;
        });
        const sortedFca = Object.entries(fcaPlatform).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
        if (sortedFca.length > 0) {
            html += '<ul>' + sortedFca.map(([platform, count]) =>
                `<li class="flex justify-between"><span>${escapeHTML(platform)}</span><strong>${count}</strong></li>`
            ).join('') + '</ul>';
        } else {
            html += '<p class="text-stone-400 text-xs">暂无</p>';
        }
        html += '</div>';

        // Middle: 通关 by platform
        html += '<div><h3 class="font-bold mb-1 text-emerald-600">通关</h3>';
        const passedPlatform = {};
        passedGames.forEach(i => {
            const p = TYPE_TO_PLATFORM[i.type] || 'Other';
            passedPlatform[p] = (passedPlatform[p] || 0) + 1;
        });
        const sortedPassed = Object.entries(passedPlatform).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
        if (sortedPassed.length > 0) {
            html += '<ul>' + sortedPassed.map(([platform, count]) =>
                `<li class="flex justify-between"><span>${escapeHTML(platform)}</span><strong>${count}</strong></li>`
            ).join('') + '</ul>';
        } else {
            html += '<p class="text-stone-400 text-xs">暂无</p>';
        }
        html += '</div>';

        // Right: 平台分布
        html += '<div><h3 class="font-bold mb-1 text-sky-600">平台分布</h3><ul>' +
            sortedGameCount.map(([platform, count]) =>
                `<li class="flex justify-between"><span>${escapeHTML(platform)}</span><strong>${count}</strong></li>`
            ).join('') + '</ul></div>';

        html += '</div>';
        totalGamesTooltip.innerHTML = html;
    }

    // Drama count by sort/genre
    const dramaCountBySort = {};
    dramas.forEach(i => {
        const sort = i.sort || '未分类';
        dramaCountBySort[sort] = (dramaCountBySort[sort] || 0) + 1;
    });

    const sortedDramaCount = Object.entries(dramaCountBySort)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    const totalDramasTooltip = document.getElementById('total-dramas-tooltip');
    if (totalDramasTooltip) {
        totalDramasTooltip.innerHTML = '<h3 class="font-bold mb-1">剧集分类统计</h3><ul>' +
            sortedDramaCount.map(([sort, count]) => `<li class="flex justify-between"><span>${escapeHTML(sort)}</span><strong>${count} 部</strong></li>`).join('') + '</ul>';
    }

    // Drama time top 10
    const topDramaTime = [...dramas].filter(i => (i.playTime ?? 0) > 0).sort((a, b) => (b.playTime || 0) - (a.playTime || 0)).slice(0, 10);
    const dramaTimeTooltip = document.getElementById('drama-time-tooltip');
    if (dramaTimeTooltip) {
        dramaTimeTooltip.innerHTML = '<h3 class="font-bold mb-1">观剧时长 Top 10</h3><ul>' +
            topDramaTime.map(g => `<li class="flex justify-between"><span>${escapeHTML(g.name.substring(0, 18))}</span><strong>${(g.playTime || 0).toFixed(1)}h</strong></li>`).join('') + '</ul>';
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
            // Measure while invisible — disable transition briefly to avoid flash
            const prevTransition = tooltip.style.transition;
            const prevPointerEvents = tooltip.style.pointerEvents;
            tooltip.style.transition = 'none';
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

            // Restore transition (CSS :hover handles opacity)
            tooltip.style.transition = prevTransition;
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
