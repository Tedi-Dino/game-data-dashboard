import { setChart, getChart } from '../core/state.js';

// The Chart.js bundle is served from a CDN (see index.html). Every render entry
// point must check this before dereferencing the `Chart` global, otherwise a CDN
// failure throws and takes Firestore listeners / KPI rendering down with it.
export const isChartAvailable = () => typeof Chart !== 'undefined';

/** Toggle the visible empty-state message that sits over a canvas. */
export const setChartEmptyState = (emptyId, isEmpty) => {
    const el = typeof emptyId === 'string' ? document.getElementById(emptyId) : emptyId;
    if (el) el.hidden = !isEmpty;
};

// Initialize Chart.js defaults
export const setupChartDefaults = () => {
    if (!isChartAvailable()) return;

    Chart.defaults.color = '#52605a';
    Chart.defaults.borderColor = 'rgba(38, 49, 45, 0.09)';
    Chart.defaults.font.family = "'Inter', 'Noto Sans SC', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.legend.labels.padding = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = '#ffffff';
    Chart.defaults.plugins.tooltip.borderColor = '#e3e9e5';
    Chart.defaults.plugins.tooltip.titleColor = '#26312d';
    Chart.defaults.plugins.tooltip.bodyColor = '#3c4a44';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleFont = { weight: 'bold' };
    Chart.defaults.plugins.tooltip.cornerRadius = 8;

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
            tooltipEl.className = 'chart-tooltip fixed bg-white text-stone-800 text-sm rounded-lg p-3 pointer-events-none w-72';
            tooltipEl.style.boxShadow = '0 16px 40px rgba(41, 37, 36, 0.16)';
            tooltipEl.style.maxWidth = 'calc(100vw - 1rem)';
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

/**
 * Render a chart, reusing the existing Chart.js instance when possible.
 *
 * Every render used to tear the chart down and build a new one, which throws
 * away animation state and rebuilds the canvas even when only a few data points
 * changed. This pushes the new data into the live instance instead. A fresh
 * instance is still created when there is nothing to reuse, when the canvas
 * element changed, or when the chart type changed — the type selects the
 * controller at construction time and cannot be swapped in place.
 *
 * @param {string} key - Key under which the chart is stored in state.
 * @param {HTMLCanvasElement} el - Canvas to draw into.
 * @param {object} config - Chart.js config ({ type, data, options }).
 * @param {*} view - Per-render data the tooltip formatter needs. Tooltip
 *   callbacks are built once when the chart is created, so anything they close
 *   over would go stale on a later update. Stashing it on the instance and
 *   refreshing it on every render keeps tooltips correct; formatters read it
 *   back via `tooltip.chart.$view`.
 * @returns {*} The live Chart instance.
 */
export const renderOrUpdateChart = (key, el, config, view = undefined) => {
    const existing = getChart(key);
    if (existing && existing.canvas === el && existing.config.type === config.type) {
        existing.data.labels = config.data.labels;
        syncDatasets(existing.data, config.data.datasets || []);
        // Options are refreshed too: some are derived from UI controls rather
        // than item data (e.g. the y-axis title follows the physical-cost mode),
        // so leaving them at their construction-time values would be wrong.
        if (config.options) mergeInto(existing.options, config.options);
        existing.$view = view;
        existing.update();
        return existing;
    }

    if (existing) destroyChartWithTooltip(existing);
    const chart = new Chart(el, config);
    chart.$view = view;
    setChart(key, chart);
    return chart;
};

/**
 * Merge `next` datasets into `target.datasets` in place.
 *
 * Mutating instead of replacing matters: Chart.js caches parsed/element state
 * per dataset, and swapping the objects wholesale would discard it (and break
 * the hover animation mid-flight). Extra datasets from a previous render are
 * truncated, new ones appended.
 */
const syncDatasets = (target, next) => {
    for (let i = 0; i < next.length; i++) {
        const incoming = next[i];
        if (target.datasets[i]) {
            Object.assign(target.datasets[i], incoming);
        } else {
            target.datasets.push(incoming);
        }
    }
    if (target.datasets.length > next.length) {
        target.datasets.length = next.length;
    }
};

/**
 * Deep-assign plain-object values from `source` into `target`.
 *
 * Only descends into plain objects; arrays and callbacks (e.g. `ticks.callback`)
 * are replaced wholesale, which is what we want for scriptable Chart.js options.
 */
const mergeInto = (target, source) => {
    if (!target || typeof target !== 'object') return source;
    for (const key of Object.keys(source)) {
        const value = source[key];
        const current = target[key];
        const canDescend =
            value && typeof value === 'object' && !Array.isArray(value) && typeof value !== 'function' &&
            current && typeof current === 'object' && !Array.isArray(current) && typeof current !== 'function';
        target[key] = canDescend ? mergeInto(current, value) : value;
    }
    return target;
};

// Destroy a single chart and remove its tooltip element from document.body
export const destroyChartWithTooltip = (chart) => {
    if (!chart) return;
    const tipEl = document.getElementById(`chartjs-tooltip-${chart.id}`);
    if (tipEl) tipEl.remove();
    chart.destroy();
};
