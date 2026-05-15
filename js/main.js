// Firebase Auth
import { auth } from './config/firebase.js';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Core
import { items, setSortConfig } from './core/state.js';
import { formatDateTime } from './core/utils.js';

// Services
import { setupFirestoreListener, setOnDataChange, setupMetadataListener } from './services/firestore.js';

// Charts
import { setupChartDefaults, destroyAllCharts } from './charts/setup.js';
import { renderCostDistributionChart } from './charts/cost-distribution.js';
import { renderTimeDistributionChart } from './charts/time-distribution.js';
import { renderGameSortChart } from './charts/game-sort.js';
import { renderGameDistributionChart } from './charts/game-distribution.js';
import { renderMonthlyTrendsChart } from './charts/monthly-trends.js';

// UI
import { updateAuthUI } from './ui/auth.js';
import { openModal, closeModal } from './ui/modals.js';
import { setupFab } from './ui/fab.js';
import { updateDashboardKPIs, updateKpiTooltips, setupKpiTooltips } from './ui/dashboard.js';
import { renderItemsList, updateSortHeaders, setupSortHeaders, setupListSearch, setupDetailColsToggle } from './ui/data-table.js';
import { setupItemForm } from './ui/item-form.js';
import { setupPlayNextModal } from './ui/play-next.js';
import { setupOnThisDay } from './ui/on-this-day.js';
import { setupCSVHandlers } from './ui/csv-handlers.js';
import { setupChartControls } from './ui/chart-controls.js';
import { triggerSteamSync, setupSteamSyncMetadataListener } from './services/steam.js';

// --- Render all charts ---
const renderCharts = () => {
    destroyAllCharts();
    renderCostDistributionChart();
    renderTimeDistributionChart();
    renderGameDistributionChart();
    renderMonthlyTrendsChart();
    renderGameSortChart();
};

// --- Full dashboard update (called after Firestore data changes) ---
let lastItemsHash = '';

const updateDashboard = () => {
    updateDashboardKPIs();
    updateKpiTooltips();

    // Only re-render charts if data actually changed
    const newHash = items.map(i => i.fb_id + '|' + i.playTime + '|' + i.purchasePrice + '|' + i.sellPrice + '|' + i.rating + '|' + i.status + '|' + i.type + '|' + i.sort + '|' + i.fullyCompleted).join(',');
    if (newHash !== lastItemsHash) {
        lastItemsHash = newHash;
        renderCharts();
    }

    const listModal = document.getElementById('list-modal');
    if (listModal && !listModal.classList.contains('hidden')) {
        renderItemsList();
    }
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
    setupChartDefaults();

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
    setupPlayNextModal();
    setupOnThisDay();
    setupChartControls();

    // Steam sync button
    const steamSyncBtn = document.getElementById('steam-sync-btn');
    const steamSyncStatus = document.getElementById('steam-sync-status');

    if (steamSyncBtn) {
        steamSyncBtn.addEventListener('click', async () => {
            steamSyncBtn.disabled = true;
            steamSyncBtn.querySelector('i').classList.add('fa-spin');
            if (steamSyncStatus) {
                steamSyncStatus.classList.remove('hidden');
                steamSyncStatus.textContent = 'Steam同步中...';
                steamSyncStatus.classList.remove('text-red-500');
            }

            const result = await triggerSteamSync();

            steamSyncBtn.disabled = false;
            steamSyncBtn.querySelector('i').classList.remove('fa-spin');

            if (result.error) {
                if (steamSyncStatus) {
                    steamSyncStatus.textContent = result.error;
                    steamSyncStatus.classList.add('text-red-500');
                }
            } else {
                const parts = [];
                if (result.matched > 0) parts.push(`匹配 ${result.matched} 款`);
                if (result.updated > 0) parts.push(`更新 ${result.updated} 款时长`);
                if (result.unmatched && result.unmatched.length > 0) parts.push(`${result.unmatched.length} 款未匹配`);
                if (result.achievementsChecked > 0) parts.push(`检查 ${result.achievementsChecked} 个成就`);
                if (result.fullyCompletedCount > 0) parts.push(`${result.fullyCompletedCount} 款全成就`);
                if (steamSyncStatus) {
                    steamSyncStatus.textContent = parts.length > 0
                        ? `Steam同步完成: ${parts.join(', ')}`
                        : 'Steam同步完成';
                    steamSyncStatus.classList.remove('text-red-500');
                }
            }
        });
    }

    // Steam sync metadata listener
    setupSteamSyncMetadataListener((data) => {
        if (!steamSyncStatus) return;
        if (data && data.lastSyncTime) {
            const formatted = formatDateTime(data.lastSyncTime);
            steamSyncStatus.classList.remove('hidden');
            const unmatched = data.unmatchedCount || 0;
            const matched = data.matchedCount || 0;
            const unmatchedText = unmatched > 0 ? `, <span class="text-amber-600 cursor-pointer underline" id="show-unmatched-link">${unmatched} 款未同步</span>` : '';
            steamSyncStatus.innerHTML = `Steam: 上次同步 ${formatted}, 匹配 ${matched} 款${unmatchedText}`;

            // Wire unmatched link
            const unmatchedLink = document.getElementById('show-unmatched-link');
            if (unmatchedLink && data.unmatchedGames && data.unmatchedGames.length > 0) {
                unmatchedLink.addEventListener('click', () => {
                    const list = data.unmatchedGames.map(g => `[${g.app_id}] ${String(g.name || '').replace(/[\r\n]/g, '')} (${g.playtime_hours}h)`).join('\n');
                    alert(`未同步的Steam游戏 (${data.unmatchedGames.length}款):\n\n${list}`);
                });
            }
        }
    });

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
    setOnDataChange(updateDashboard);

    // Start listeners
    setupFirestoreListener();
    setupMetadataListener();

    // Card entrance animations
    document.querySelectorAll('.card-animation').forEach((card, index) => {
        card.style.animationDelay = `${(index + 1) * 100}ms`;
    });

    // Auth state observer -- registered after DOM is ready
    onAuthStateChanged(auth, (user) => {
        updateAuthUI(user);
    });
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', initApp);
