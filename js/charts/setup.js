import { charts, setChart, removeChart, getChart } from '../core/state.js';

// Initialize Chart.js defaults
export const setupChartDefaults = () => {
    Chart.defaults.color = '#2d2927';
    Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.08)';
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.tooltip.backgroundColor = '#ffffff';
    Chart.defaults.plugins.tooltip.borderColor = 'transparent';
    Chart.defaults.plugins.tooltip.titleColor = '#1c1917';
    Chart.defaults.plugins.tooltip.bodyColor = '#2d2927';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold' };

    // Global plug-in: misty cyan gradient indicating cost-performance direction
    // on scatter/price-time charts (bottom-right = best value)
    Chart.register({
        id: 'valueDirectionGradient',
        beforeDraw(chart) {
            if (chart.config.type !== 'scatter') return;
            const { ctx, chartArea } = chart;
            if (!chartArea || chartArea.width <= 0 || chartArea.height <= 0) return;
            const g = ctx.createLinearGradient(chartArea.left, chartArea.top, chartArea.right, chartArea.bottom);
            g.addColorStop(0, 'rgba(106, 184, 238, 0)');
            g.addColorStop(1, 'rgba(106, 184, 238, 0.10)');
            ctx.save();
            ctx.fillStyle = g;
            ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
            ctx.restore();
        }
    });
};

/**
 * Factory: create an external tooltip handler for a Chart.js instance.
 * Uses position:fixed + document.body to guarantee viewport-visible tooltips,
 * avoiding issues with small/overflow-hidden ancestor containers.
 * @param {Function} formatter - (tooltip) => htmlString | null
 */
export const createExternalTooltip = (formatter) => {
    return (context) => {
        const { chart, tooltip } = context;

        // Each chart gets its own tooltip element on document.body
        const tipId = `chartjs-tooltip-${chart.id}`;
        let tooltipEl = document.getElementById(tipId);
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = tipId;
            tooltipEl.className = 'fixed bg-white text-stone-800 text-sm rounded-lg p-3 pointer-events-none w-72';
            tooltipEl.style.boxShadow = '0 10px 30px rgba(0,0,0,0.06)';
            tooltipEl.style.opacity = '0';
            tooltipEl.style.transition = 'opacity 100ms ease';
            tooltipEl.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue('--z-chart-tooltip').trim();
            document.body.appendChild(tooltipEl);
        }

        // Hide if not active
        if (tooltip.opacity === 0) {
            tooltipEl.style.opacity = '0';
            return;
        }

        const html = formatter(tooltip);
        if (!html) {
            tooltipEl.style.opacity = '0';
            return;
        }

        tooltipEl.innerHTML = html;
        // Force reflow so offsetWidth/offsetHeight reflect the new content
        void tooltipEl.offsetHeight;

        // Caret position in viewport coordinates
        const canvasRect = chart.canvas.getBoundingClientRect();
        const caretVX = canvasRect.left + tooltip.caretX;
        const caretVY = canvasRect.top + tooltip.caretY;

        const tooltipWidth = tooltipEl.offsetWidth;
        const tooltipHeight = tooltipEl.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;

        // --- Horizontal: center on caret, clamp within viewport ---
        let finalLeft = caretVX - (tooltipWidth / 2);
        if (tooltipWidth >= vw) {
            finalLeft = pad;
        } else {
            finalLeft = Math.max(pad, Math.min(finalLeft, vw - tooltipWidth - pad));
        }

        // --- Vertical: prefer above the point, flip below if needed ---
        let finalTop = caretVY - tooltipHeight - 12;
        if (finalTop < pad) {
            finalTop = caretVY + 16;
        }
        // Final clamp: keep within viewport
        finalTop = Math.max(pad, Math.min(finalTop, vh - tooltipHeight - pad));

        tooltipEl.style.opacity = '1';
        tooltipEl.style.left = finalLeft + 'px';
        tooltipEl.style.top = finalTop + 'px';
    };
};

// Destroy a single chart and remove its tooltip element from document.body
export const destroyChartWithTooltip = (chart) => {
    if (!chart) return;
    const tipEl = document.getElementById(`chartjs-tooltip-${chart.id}`);
    if (tipEl) tipEl.remove();
    chart.destroy();
};

// Destroy all charts and reset the chart store
export const destroyAllCharts = () => {
    Object.values(charts).forEach(chart => {
        destroyChartWithTooltip(chart);
    });
    for (const key of Object.keys(charts)) {
        removeChart(key);
    }
};
