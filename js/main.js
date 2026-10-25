// Firebase Auth
import { auth } from './config/firebase.js';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Core
import { items, steamPlaytimeMonths, steamPlaytimeStates, steamPlaytimeTracking } from './core/state.js';
import { formatDateTime, toLocalISODate } from './core/utils.js';
import { FEATURES } from './config/constants.js';

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
import { closeModal, showAlert, showToast } from './ui/modals.js';
import { setupFab } from './ui/fab.js';
import { updateDashboardKPIs, updateKpiTooltips, setupKpiTooltips } from './ui/dashboard.js';
import {
    renderItemsList, setupSortHeaders, setupListSearch,
    setupDetailColsToggle, setupItemsTableClick, setupListFilterBar,
    setupListPagination, openListModal,
} from './ui/data-table.js';
import { setupKpiFilters } from './ui/kpi-filters.js';
import { buildChartSignature, buildItemsHash } from './ui/chart-signature.js';
import { setupItemForm } from './ui/item-form.js';
import { setupPlayNextModal } from './ui/play-next.js';
import { setupOnThisDay } from './ui/on-this-day.js';
import { setupCSVHandlers } from './ui/csv-handlers.js';
import { setupChartControls } from './ui/chart-controls.js';
import { triggerSteamSync, setupSteamSyncMetadataListener } from './services/steam.js';
import { setupSteamPlaytimeListener } from './services/steam-playtime.js';

// --- Render all charts (with per-chart error isolation) ---
const getSteamPlaytimeHash = () => JSON.stringify({
    tracking: {
        initializedAt: steamPlaytimeTracking?.initializedAt?.seconds || steamPlaytimeTracking?.initializedAt || null,
        lastCompletedAt: steamPlaytimeTracking?.lastCompletedAt?.seconds || steamPlaytimeTracking?.lastCompletedAt || null,
    },
    months: Array.from(steamPlaytimeMonths.entries()).map(([month, data]) => [month, data?.updatedAt?.seconds || data?.updatedAt || null, data?.trackedTotalMinutes || 0, data?.minutesByApp || {}]),
    // Every field the monthly chart reads from a per-app state. Missing any of
    // these would let an updated Steam baseline stay stale on screen.
    states: Array.from(steamPlaytimeStates.entries()).map(([appId, state]) => [
        appId,
        state?.firstSeenMode || null,
        state?.initialObservedAt?.seconds || state?.initialObservedAt || null,
        state?.lastObservedAt?.seconds || state?.lastObservedAt || null,
        state?.initialTotalMinutes || 0,
    ]),
});

const CHART_RENDERERS = {
    cost: renderCostDistributionChart,
    time: renderTimeDistributionChart,
    scatter: renderGameDistributionChart,
    monthly: renderMonthlyTrendsChart,
    genre: renderGameSortChart,
};

// Accepts a precomputed Steam hash so updateDashboard only stringifies it once
// instead of once here plus once per chart.
const renderCharts = (steamHash) => {
    // Chart.js is loaded from a CDN. If it failed, skip chart rendering instead of
    // throwing: KPIs, tables and auth must keep working.
    if (!isChartAvailable()) return;

    if (!window._chartHashes) window._chartHashes = {};
    const todayKey = toLocalISODate(new Date());

    for (const [name, fn] of Object.entries(CHART_RENDERERS)) {
        const sig = buildChartSignature(items, name, steamHash, todayKey);
        if (window._chartHashes[name] === sig) continue;
        try {
            fn();
            // Only remember the signature after a successful render: a chart that
            // threw once must get another chance on the next data update.
            window._chartHashes[name] = sig;
        } catch (e) {
            console.error(`Chart "${name}" render failed:`, e);
        }
    }
};

// --- Full dashboard update (called after Firestore data changes) ---
let lastItemsHash = '';
let skeletonFallbackTimer = null;

const clearSkeleton = () => {
    document.body.classList.remove('skeleton-loading');
    if (skeletonFallbackTimer) {
        clearTimeout(skeletonFallbackTimer);
        skeletonFallbackTimer = null;
    }
};

const updateDashboard = () => {
    clearSkeleton();
    updateDashboardKPIs();
    updateKpiTooltips();

    // Only re-render charts if data actually changed
    const steamHash = getSteamPlaytimeHash();
    const newHash = buildItemsHash(items, steamHash);
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
// Map SDK error codes to actionable text. Every sign-in failure used to be
// swallowed into console.error, so a blocked popup, an unlisted domain and a
// network failure all looked like "the button does nothing".
const AUTH_ERROR_MESSAGES = {
    'auth/popup-blocked': '浏览器拦截了登录弹窗，请允许本站弹出窗口后重试。',
    'auth/cancelled-popup-request': '上一次登录尚未结束，请稍后重试。',
    'auth/unauthorized-domain': '当前域名未在 Firebase 授权域名列表中，请到 Authentication → Settings → Authorized domains 添加。',
    'auth/operation-not-allowed': 'Firebase 控制台未启用 Google 登录方式。',
    'auth/network-request-failed': '无法连接 Google 登录服务，请检查网络或代理后重试。',
    'auth/internal-error': '登录服务内部错误，请刷新页面后重试。',
};

const signInWithGoogle = async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        // Closing the popup on purpose needs no dialog.
        if (error?.code === 'auth/popup-closed-by-user') return;
        const message = AUTH_ERROR_MESSAGES[error?.code]
            || `登录失败：${error?.code || error?.message || '未知错误'}`;
        showAlert(message);
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
    // Keep the skeleton until the first data snapshot, but never let a failed CDN
    // asset or Firestore listener leave the page on it forever.
    skeletonFallbackTimer = setTimeout(() => {
        if (!document.body.classList.contains('skeleton-loading')) return;
        clearSkeleton();
        showToast('数据加载时间较长，请检查网络连接后刷新。', { tone: 'error', timeout: 6000 });
    }, 8000);

    // Chart.js comes from a CDN (index.html) — guard every use of the global.
    if (typeof Chart !== 'undefined') {
        try {
            setupChartDefaults();
        } catch (e) {
            console.error('Chart.js defaults setup failed:', e);
        }
    } else {
        console.warn('Chart.js unavailable — charts disabled, dashboard still functional.');
        document.querySelectorAll('.chart-card').forEach(card => card.classList.add('chart-unavailable'));
    }

    // Online/offline banner. Firestore keeps working from cache while offline, so
    // this is informational rather than blocking.
    const appStatus = document.getElementById('app-status');
    const updateNetworkStatus = (online) => {
        if (!appStatus) return;
        appStatus.textContent = online
            ? ''
            : '当前离线：页面展示缓存数据，新增或修改会在恢复网络后同步。';
        appStatus.classList.toggle('is-visible', !online);
        appStatus.dataset.tone = online ? 'ok' : 'warn';
    };
    window.addEventListener('offline', () => updateNetworkStatus(false));
    window.addEventListener('online', () => {
        updateNetworkStatus(true);
        showToast('网络已恢复', { tone: 'success' });
    });
    if (navigator.onLine === false) updateNetworkStatus(false);

    // Auth buttons
    document.getElementById('login-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn')?.addEventListener('click', signOutUser);

    // UI modules
    setupFab();
    setupItemForm();
    setupCSVHandlers();
    setupSortHeaders();
    setupListSearch();
    setupListFilterBar();
    setupListPagination();
    setupDetailColsToggle();
    setupItemsTableClick();
    setupKpiFilters();
    setupPlayNextModal();
    setupOnThisDay();
    setupChartControls();

    // Steam sync button. On Spark the callable cannot be deployed, so the
    // button is never wired — the metadata below still shows the last run from
    // tools/steam_sync/sync.mjs.
    const steamSyncBtn = document.getElementById('steam-sync-btn');
    const steamSyncStatus = document.getElementById('steam-sync-status');

    if (steamSyncBtn && !FEATURES.STEAM_SYNC) {
        steamSyncBtn.classList.add('hidden');
        steamSyncBtn.classList.remove('flex');
    }

    if (steamSyncBtn && FEATURES.STEAM_SYNC) {
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
        openListModal(null);
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
