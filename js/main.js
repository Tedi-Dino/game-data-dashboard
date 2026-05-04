// Firebase Auth
import { auth } from './config/firebase.js';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Core
import { items, setSortConfig } from './core/state.js';

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
import { renderItemsList, updateSortHeaders, setupSortHeaders, setupListSearch } from './ui/data-table.js';
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
    const newHash = items.map(i => i.fb_id + '|' + i.playTime + '|' + i.purchasePrice + '|' + i.sellPrice).join(',');
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
            const d = data.lastSyncTime.toDate();
            const formatted = `${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)} ${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}`;
            steamSyncStatus.classList.remove('hidden');
            steamSyncStatus.textContent = `Steam: 上次同步 ${formatted}, 匹配 ${data.matchedCount || 0} 款`;
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
        setSortConfig('passDate', 'desc');
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
