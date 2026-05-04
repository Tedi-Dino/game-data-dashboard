import { charts, gameDistributionMode, setGameDistributionMode } from '../core/state.js';
import { renderGameDistributionChart } from '../charts/game-distribution.js';
import { renderMonthlyTrendsChart } from '../charts/monthly-trends.js';
import { openModal, closeModal } from './modals.js';

/**
 * Setup chart control UI: distribution mode toggle, monthly fullscreen, hardware checkbox.
 */
export const setupChartControls = () => {
    const distTimeBtn = document.getElementById('dist-time-btn');
    const distPriceBtn = document.getElementById('dist-price-btn');
    const excludeHardwareCheckbox = document.getElementById('exclude-hardware-checkbox');
    const excludeUnsoldPhysicalCheckbox = document.getElementById('exclude-unsold-physical-checkbox');
    const fullscreenBtn = document.getElementById('monthly-chart-fullscreen-btn');
    const fullscreenModal = document.getElementById('monthly-chart-fullscreen-modal');
    const closeFullscreenBtn = document.getElementById('close-monthly-chart-fullscreen-btn');
    const fullscreenContainer = document.getElementById('fullscreen-chart-container');

    // Helper: set active button style
    const setDistButtonActive = (activeBtn) => {
        [distTimeBtn, distPriceBtn].forEach(btn => {
            if (!btn) return;
            btn.classList.remove('bg-amber-600', 'text-white');
            btn.classList.add('text-stone-600', 'hover:bg-stone-200');
        });
        if (activeBtn) {
            activeBtn.classList.add('bg-amber-600', 'text-white');
            activeBtn.classList.remove('text-stone-600', 'hover:bg-stone-200');
        }
    };

    // Distribution mode: Time
    if (distTimeBtn) {
        distTimeBtn.addEventListener('click', () => {
            if (gameDistributionMode === 'time') return;
            setGameDistributionMode('time');
            setDistButtonActive(distTimeBtn);
            renderGameDistributionChart();
        });
    }

    // Distribution mode: Price
    if (distPriceBtn) {
        distPriceBtn.addEventListener('click', () => {
            if (gameDistributionMode === 'price') return;
            setGameDistributionMode('price');
            setDistButtonActive(distPriceBtn);
            renderGameDistributionChart();
        });
    }

    // Exclude hardware checkbox
    if (excludeHardwareCheckbox) {
        excludeHardwareCheckbox.addEventListener('change', () => renderMonthlyTrendsChart());
    }

    // Exclude unsold physical games checkbox
    if (excludeUnsoldPhysicalCheckbox) {
        excludeUnsoldPhysicalCheckbox.addEventListener('change', () => renderGameDistributionChart());
    }

    // Monthly chart fullscreen
    if (fullscreenBtn && fullscreenModal) {
        fullscreenBtn.addEventListener('click', () => {
            openModal(fullscreenModal);

            const isMobile = window.innerWidth < 768;
            if (fullscreenContainer) {
                if (isMobile) {
                    fullscreenContainer.style.position = 'fixed';
                    fullscreenContainer.style.top = '0';
                    fullscreenContainer.style.left = '100%';
                    fullscreenContainer.style.width = '100dvh';
                    fullscreenContainer.style.height = '100dvw';
                    fullscreenContainer.style.padding = 'max(20px, env(safe-area-inset-left)) max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom))';
                    fullscreenContainer.style.transformOrigin = 'top left';
                    fullscreenContainer.style.transform = 'rotate(90deg)';
                    fullscreenContainer.style.margin = '0';
                    fullscreenContainer.style.borderRadius = '0';
                    fullscreenContainer.style.zIndex = '55';
                    fullscreenContainer.style.boxSizing = 'border-box';
                } else {
                    fullscreenContainer.style = '';
                    fullscreenContainer.classList.add('w-full', 'h-full');
                }
            }

            requestAnimationFrame(() => renderMonthlyTrendsChart(true));
        });
    }

    if (closeFullscreenBtn && fullscreenModal) {
        closeFullscreenBtn.addEventListener('click', () => {
            closeModal(fullscreenModal);
            if (fullscreenContainer) fullscreenContainer.style = '';
            if (charts.monthlyTrendsFullscreen) {
                charts.monthlyTrendsFullscreen.destroy();
                charts.monthlyTrendsFullscreen = undefined;
            }
        });
    }
};
