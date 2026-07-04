import { getChart, removeChart } from '../core/state.js';
import { destroyChartWithTooltip } from '../charts/setup.js';
import { renderGameDistributionChart } from '../charts/game-distribution.js';
import { renderMonthlyTrendsChart } from '../charts/monthly-trends.js';
import { openModal, closeModal } from './modals.js';

/**
 * Setup chart control UI: monthly fullscreen, hardware checkbox, physical cost mode selector.
 */
export const setupChartControls = () => {
    const excludeHardwareCheckbox = document.getElementById('exclude-hardware-checkbox');
    const physicalCostModeSelect = document.getElementById('physical-cost-mode-select');
    const fullscreenBtn = document.getElementById('monthly-chart-fullscreen-btn');
    const fullscreenModal = document.getElementById('monthly-chart-fullscreen-modal');
    const closeFullscreenBtn = document.getElementById('close-monthly-chart-fullscreen-btn');
    const fullscreenContainer = document.getElementById('fullscreen-chart-container');

    // Exclude hardware checkbox
    if (excludeHardwareCheckbox) {
        excludeHardwareCheckbox.addEventListener('change', () => renderMonthlyTrendsChart());
    }

    // Physical cartridge cost mode for the price-time scatter chart
    if (physicalCostModeSelect) {
        physicalCostModeSelect.addEventListener('change', () => renderGameDistributionChart());
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
                    fullscreenContainer.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue('--z-modal-fullscreen').trim();
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
            if (getChart('monthlyTrendsFullscreen')) {
                destroyChartWithTooltip(getChart('monthlyTrendsFullscreen'));
                removeChart('monthlyTrendsFullscreen');
            }
        });
    }
};
