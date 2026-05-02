import { charts } from '../core/state.js';

// Initialize Chart.js defaults
export const setupChartDefaults = () => {
    Chart.defaults.color = '#2d2927';
    Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.08)';
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.tooltip.backgroundColor = '#ffffff';
    Chart.defaults.plugins.tooltip.borderColor = '#e5e0dc';
    Chart.defaults.plugins.tooltip.titleColor = '#1c1917';
    Chart.defaults.plugins.tooltip.bodyColor = '#2d2927';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold' };
};

/**
 * Factory: create an external tooltip handler for a Chart.js instance.
 * Mounts tooltip inside chart.canvas.parentNode so rotation transforms inherit.
 * @param {Function} formatter - (tooltip) => htmlString | null
 */
export const createExternalTooltip = (formatter) => {
    return (context) => {
        const { chart, tooltip } = context;

        // Find or create tooltip element inside chart's parent
        let tooltipEl = chart.canvas.parentNode.querySelector('div.chartjs-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'chartjs-tooltip absolute bg-white text-stone-800 text-sm rounded-lg shadow-lg p-3 opacity-0 pointer-events-none transition-opacity duration-100 w-72 z-[9999] border border-stone-200';
            chart.canvas.parentNode.appendChild(tooltipEl);
        }

        // Hide if not active
        if (tooltip.opacity === 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        const html = formatter(tooltip);
        if (!html) {
            tooltipEl.style.opacity = 0;
            return;
        }

        tooltipEl.innerHTML = html;

        // Positioning relative to parent container
        const tooltipWidth = tooltipEl.offsetWidth;
        const tooltipHeight = tooltipEl.offsetHeight;
        const containerWidth = chart.canvas.parentNode.clientWidth;
        const containerHeight = chart.canvas.parentNode.clientHeight;
        const pad = 4; // px padding from edges

        // --- Horizontal ---
        // Center on the caret, then clamp within container
        let finalLeft = tooltip.caretX - (tooltipWidth / 2);
        // If tooltip wider than container, just pin left
        if (tooltipWidth >= containerWidth) {
            finalLeft = pad;
        } else {
            if (finalLeft < pad) finalLeft = pad;
            if (finalLeft + tooltipWidth > containerWidth - pad) {
                finalLeft = containerWidth - tooltipWidth - pad;
            }
        }

        // --- Vertical ---
        // Prefer above the data point; flip below if that overflows the top
        let finalTop = tooltip.caretY - tooltipHeight - 10;

        if (finalTop < pad) {
            // Not enough room above — try below
            if ((tooltip.caretY + 20 + tooltipHeight) <= containerHeight - pad) {
                finalTop = tooltip.caretY + 20;  // below
            } else {
                // Neither fits well — pin to top of container
                finalTop = pad;
            }
        }

        // Final safety clamp: never overflow container bottom
        if (finalTop + tooltipHeight > containerHeight - pad) {
            finalTop = Math.max(pad, containerHeight - tooltipHeight - pad);
        }

        tooltipEl.style.opacity = 1;
        tooltipEl.style.left = finalLeft + 'px';
        tooltipEl.style.top = finalTop + 'px';
    };
};

// Destroy all charts and reset the chart store
export const destroyAllCharts = () => {
    Object.values(charts).forEach(chart => {
        if (chart && chart.destroy) chart.destroy();
    });
    for (const key of Object.keys(charts)) {
        charts[key] = undefined;
    }
};
