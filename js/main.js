// Firebase Auth
import { auth } from './config/firebase.js';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Core
import { items, steamPlaytimeMonths, steamPlaytimeStates, steamPlaytimeTracking, setSortConfig } from './core/state.js';
import { formatDateTime, toLocalISODate } from './core/utils.js';

// Services
import { setupFirestoreListener, setOnDataChange, setupMetadataListener } from './services/firestore.js';

// Charts
import { setupChartDefaults, isChartAvailable } from './charts/setup.js';
import { renderCostDistributionChart } from './charts/cost-distribution.js';
import { renderTimeDistributionChart } from './charts/time-distribution.js';
import { renderGameSortChart } from './charts/game-sort.js';
import { renderGameDistributionChart } from './charts/game-distribution.js';
import { renderMonthlyTrendsChart } from './charts/monthly-trends.js';

// UI
import { updateAuthUI } from './ui/auth.js';
import { openModal, closeModal, showAlert } from './ui/modals.js';
import { setupFab } from './ui/fab.js';
import { updateDashboardKPIs, updateKpiTooltips, setupKpiTooltips } from './ui/dashboard.js';
import { renderItemsList, updateSortHeaders, setupSortHeaders, setupListSearch, setupDetailColsToggle, setupItemsTableClick } from './ui/data-table.js';
import { setupItemForm } from './ui/item-form.js';
import { setupPlayNextModal } from './ui/play-next.js';
import { setupOnThisDay } from './ui/on-this-day.js';
import { setupCSVHandlers } from './ui/csv-handlers.js';
import { setupChartControls } from './ui/chart-controls.js';
import { triggerSteamSync, setupSteamSyncMetadataListener } from './services/steam.js';
import { setupSteamPlaytimeListener } from './services/steam-playtime.js';

// --- Render all charts (with per-chart error isolation) ---
const getSteamPlaytimeHash = () => JSON.stringify({
    tracking: steamPlaytimeTracking?.lastCompletedAt?.seconds || steamPlaytimeTracking?.lastCompletedAt || null,
    months: Array.from(steamPlaytimeMonths.entries()).map(([month, data]) => [month, data?.updatedAt?.seconds || data?.updatedAt || null, data?.trackedTotalMinutes || 0, data?.minutesByApp || {}]),
    states: Array.from(steamPlaytimeStates.entries()).map(([appId, state]) => [appId, state?.lastObservedAt?.seconds || state?.lastObservedAt || null, state?.initialTotalMinutes || 0]),
});

// Accepts a precomputed Steam hash so updateDashboard only stringifies it once
// instead of once here plus once per chart.
const renderCharts = (steamHash) => {
    // Chart.js is loaded from a CDN. If it failed, skip chart rendering instead of
    // throwing: KPIs, tables and auth must keep working.
    if (!isChartAvailable()) return;

    // Per-chart data signatures — only rebuild charts whose data changed.
    // Signature fields must cover EVERY field the chart reads, or main.js skips
    // the re-render and the chart silently shows stale data.
    const chartConfigs = [
    // cost: netCost() reads type/sellDate; tooltip reads name
    { name: 'cost', fn: renderCostDistributionChart, fields: ['purchasePrice','sellPrice','type','sellDate','from','remarks','name'] },
    // time: tooltip reads name
    { name: 'time', fn: renderTimeDistributionChart, fields: ['playTime','type','status','name'] },
    // scatter: y-value depends on isUnsoldPhysical -> sellDate, absent sellPrice
    { name: 'scatter', fn: renderGameDistributionChart, fields: ['playTime','purchasePrice','sellPrice','rating','type','name','from','remarks','sellDate'] },
    // monthly: tooltip renders stars -> rating
    { name: 'monthly', fn: renderMonthlyTrendsChart, fields: ['playTime','purchasePrice','sellPrice','type','status','purchaseDate','startDate','sellDate','passDate','name','episodeCount','episodeDuration','rating'] },
    // genre: playTime drives the sector size itself — Steam daily sync updates it
    { name: 'genre', fn: renderGameSortChart, fields: ['sort','type','playTime','name','rating'] },
    ];

    if (!window._chartHashes) window._chartHashes = {};

    for (const { name, fn, fields } of chartConfigs) {
        // Unfinished games amortize up to "now", so the monthly chart also depends
        // on the wall clock (see monthly-trends.js `new Date()` end dates). Fold
        // today's date into the signature so a page left open past midnight recalcs.
        const todayKey = toLocalISODate(new Date());
        const sig = items.map(i => fields.map(f => i[f] ?? '').join('|')).join(',')
            + (name === 'monthly' ? `|steam:${steamHash}|today:${todayKey}` : '');
        if (window._chartHashes[name] === sig) continue;
        window._chartHashes[name] = sig;
        try {
            fn();
        } catch (e) {
            console.error(`Chart "${name}" render failed:`, e);
        }
    }
};

// --- Full dashboard update (called after Firestore data changes) ---
let lastItemsHash = '';

const updateDashboard = () => {
    document.body.classList.remove('skeleton-loading');
    updateDashboardKPIs();
    updateKpiTooltips();

    // Only re-render charts if data actually changed
    const steamHash = getSteamPlaytimeHash();
    const newHash = items.map(i => i.fb_id + '|' + i.playTime + '|' + i.purchasePrice + '|' + i.sellPrice + '|' + i.rating + '|' + i.status + '|' + i.type + '|' + i.sort + '|' + i.fullyCompleted + '|' + i.purchaseDate + '|' + i.startDate + '|' + i.sellDate + '|' + i.passDate + '|' + i.name + '|' + i.from + '|' + i.episodeCount + '|' + i.episodeDuration + '|' + (i.remarks || '')).join(',') + '|' + steamHash;
    if (newHash !== lastItemsHash) {
        lastItemsHash = newHash;
        renderCharts(steamHash);
    }

    const listModal = document.getElementById('list-modal');
    if (listModal && !listModal.classList.contains('hidden')) {
        renderItemsList();
    }
};

// Five independent listeners all fire during cold start (IndexedDB cache, the
// Firestore snapshot, and three Steam onSnapshots). Coalesce them into a single
// render per frame instead of repeating the same full recompute five times.
let dashboardQueued = false;
const scheduleDashboardUpdate = () => {
    if (dashboardQueued) return;
    dashboardQueued = true;
    requestAnimationFrame(() => {
        dashboardQueued = false;
        updateDashboard();
    });
};

// --- Auth actions ---
const signInWithGoogle = async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        console.error('Google Sign-In Error:', error);
    }
};

const signOutUser = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Sign-Out Error:', error);
    }
};

// --- Backdrop click helper ---
const setupModalBackdrop = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
};

// --- Initialization ---
const initApp = () => {
    // Never let a failed CDN asset keep the page on its loading skeleton.
    document.body.classList.remove('skeleton-loading');

    // Chart.js comes from a CDN (index.html) — guard every use of the global.
    if (typeof Chart !== 'undefined') {
        try {
            setupChartDefaults();
        } catch (e) {
            console.error('Chart.js defaults setup failed:', e);
        }
    } else {
        console.warn('Chart.js unavailable — charts disabled, dashboard still functional.');
    }

    // Auth buttons
    document.getElementById('login-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn')?.addEventListener('click', signOutUser);

    // UI modules
    setupFab();
    setupItemForm();
    setupCSVHandlers();
    setupSortHeaders();
    setupListSearch();
    setupDetailColsToggle();
    setupItemsTableClick();
    setupPlayNextModal();
    setupOnThisDay();
    setupChartControls();

    // Steam sync button
    const steamSyncBtn = document.getElementById('steam-sync-btn');
    const steamSyncStatus = document.getElementById('steam-sync-status');

    if (steamSyncBtn) {
        steamSyncBtn.addEventListener('click', async () => {
            const icon = steamSyncBtn.querySelector('i');
            steamSyncBtn.disabled = true;
            if (icon) icon.classList.add('fa-spin');
            if (steamSyncStatus) {
                steamSyncStatus.classList.remove('hidden');
                steamSyncStatus.textContent = 'Steam同步中...';
                steamSyncStatus.classList.remove('text-red-500');
            }

            const result = await triggerSteamSync();

            if (!steamSyncBtn.isConnected) return; // element removed from DOM
            steamSyncBtn.disabled = false;
            if (icon) icon.classList.remove('fa-spin');

            if (result.error) {
                if (steamSyncStatus && steamSyncStatus.isConnected) {
                    steamSyncStatus.textContent = result.error;
                    steamSyncStatus.classList.add('text-red-500');
                }
            } else if (result.skipped === 'already-running') {
                if (steamSyncStatus && steamSyncStatus.isConnected) {
                    steamSyncStatus.textContent = 'Steam同步已在运行，本次请求已跳过';
                    steamSyncStatus.classList.remove('text-red-500');
                }
            } else {
                const parts = [];
                if (result.matched > 0) parts.push(`匹配 ${result.matched} 款`);
                if (result.updated > 0) parts.push(`更新 ${result.updated} 款时长`);
                if (result.unmatched && result.unmatched.length > 0) parts.push(`${result.unmatched.length} 款未匹配`);
                if (result.achievementsChecked > 0) parts.push(`检查 ${result.achievementsChecked} 个成就`);
                if (result.fullyCompletedCount > 0) parts.push(`${result.fullyCompletedCount} 款全成就`);
                if (steamSyncStatus && steamSyncStatus.isConnected) {
                    steamSyncStatus.textContent = parts.length > 0
                        ? `Steam同步完成: ${parts.join(', ')}`
                        : 'Steam同步完成';
                    steamSyncStatus.classList.remove('text-red-500');
                }
            }
        });
    }

    // Steam sync metadata listener (event delegation avoids listener leak on re-render)
    let steamSyncData = null;
    setupSteamSyncMetadataListener((data) => {
        steamSyncData = data;
        if (!steamSyncStatus || !steamSyncStatus.isConnected) return;
        if (data && data.lastSyncTime) {
            const formatted = formatDateTime(data.lastSyncTime);
            steamSyncStatus.classList.remove('hidden');
            const unmatched = data.unmatchedCount || 0;
            const matched = data.matchedCount || 0;
            // Use textContent for safe content, with a separate clickable span
            if (unmatched > 0) {
                steamSyncStatus.textContent = '';
                const textNode = document.createTextNode(`Steam: 上次同步 ${formatted}, 匹配 ${matched} 款, `);
                const link = document.createElement('span');
                link.className = 'text-amber-600 cursor-pointer underline show-unmatched';
                link.textContent = `${unmatched} 款未同步`;
                steamSyncStatus.appendChild(textNode);
                steamSyncStatus.appendChild(link);
            } else {
                steamSyncStatus.textContent = `Steam: 上次同步 ${formatted}, 匹配 ${matched} 款`;
            }
        }
    });

    // Delegated click for unmatched games link (avoids listener leak on re-render)
    if (steamSyncStatus) {
        steamSyncStatus.addEventListener('click', (e) => {
            const target = e.target.closest('.show-unmatched');
            if (!target || !steamSyncData?.unmatchedGames?.length) return;
            const list = steamSyncData.unmatchedGames.map(g => `[${g.app_id}] ${String(g.name || '').replace(/[\r\n]/g, '')} (${g.playtime_hours}h)`).join('\n');
            showAlert(`未同步的Steam游戏 (${steamSyncData.unmatchedGames.length}款):\n\n${list}`);
        });
    }

    // Modal backdrop click-to-close (non-form modals)
    setupModalBackdrop('list-modal');
    setupModalBackdrop('on-this-day-modal');
    setupModalBackdrop('play-next-modal');
    setupModalBackdrop('monthly-chart-fullscreen-modal');

    // List modal close button
    document.getElementById('close-list-modal-btn')?.addEventListener('click', () => {
        closeModal(document.getElementById('list-modal'));
    });

    // View all button
    document.getElementById('view-all-btn')?.addEventListener('click', () => {
        const title = document.getElementById('list-modal-title');
        const searchInput = document.getElementById('list-search-input');
        if (title) title.textContent = '数据详情';
        if (searchInput) searchInput.value = '';
        setSortConfig('_default', 'desc');
        renderItemsList();
        updateSortHeaders();
        openModal(document.getElementById('list-modal'));
    });

    // Smart tooltip positioning (viewport-aware)
    setupKpiTooltips();

    // Firestore data change → update dashboard
    setOnDataChange(scheduleDashboardUpdate);

    // Start listeners
    setupFirestoreListener();
    setupMetadataListener();
    setupSteamPlaytimeListener(scheduleDashboardUpdate);

    // Card entrance animations (cap delay for snappy feel)
    document.querySelectorAll('.card-animation').forEach((card, index) => {
        card.style.animationDelay = `${Math.min((index + 1) * 60, 400)}ms`;
    });

    // Auth state observer -- registered after DOM is ready
    onAuthStateChanged(auth, (user) => {
        updateAuthUI(user);
    });
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', initApp);
