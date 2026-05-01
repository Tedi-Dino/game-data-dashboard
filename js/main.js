// Firebase Auth
import { auth } from './config/firebase.js';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// Core
import { setSortConfig } from './core/state.js';

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
const updateDashboard = () => {
    updateDashboardKPIs();
    renderCharts();
    updateKpiTooltips();

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
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, (index + 1) * 100);
    });
};

// --- Auth State Observer ---
onAuthStateChanged(auth, (user) => {
    updateAuthUI(user);
});

// --- Boot ---
document.addEventListener('DOMContentLoaded', initApp);
