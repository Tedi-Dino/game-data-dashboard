/**
 * A6: charts must reuse the existing Chart.js instance instead of destroying
 * and rebuilding it on every render.
 *
 * The regression this guards is twofold:
 *   1. a stale `Chart` instance must not be mutated after its canvas changed
 *      (that would draw into a detached node), and
 *   2. tooltip formatters are created ONCE at construction time, so if a chart
 *      is updated in place the formatter must not keep reading the numbers it
 *      happened to close over on first render.
 *
 * Both are verified against the real `renderOrUpdateChart` implementation using
 * a recording fake `Chart` global.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setChart, getChart } from '../../js/core/state.js';
import { renderOrUpdateChart, isChartAvailable } from '../../js/charts/setup.js';

// `destroyChartWithTooltip` removes the tooltip node from the document and the
// tooltip handler reads computed styles / viewport size, so the paths below need
// a minimal DOM. This is browser code; the stub exists only so those branches
// can be exercised under `node --test`.
globalThis.document = {
    documentElement: {},
    body: { appendChild: () => {}, removeChild: () => {} },
    createElement: () => ({ style: {}, className: '', id: '', innerHTML: '', remove: () => {} }),
    getElementById: () => null,
};
globalThis.window = { innerWidth: 1200, innerHeight: 800 };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '100' });

const makeCanvas = (id) => ({ id, tagName: 'CANVAS', nodeType: 1 });

// Minimal stand-in for the Chart.js constructor.
const installFakeChart = () => {
    const created = [];
    globalThis.Chart = class FakeChart {
        constructor(canvas, config) {
            this.canvas = canvas;
            this.config = config;
            this.data = config.data;
            this.options = config.options;
            this.id = created.length;
            this.updates = 0;
            this.destroyed = false;
            created.push(this);
        }
        update() {
            this.updates += 1;
        }
        destroy() {
            this.destroyed = true;
        }
    };
    return created;
};

test('isChartAvailable: false before Chart is defined, true after', () => {
    delete globalThis.Chart;
    assert.equal(isChartAvailable(), false);
    installFakeChart();
    assert.equal(isChartAvailable(), true);
});

test('renderOrUpdateChart: creates a chart on first render', () => {
    const created = installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('cost-chart');

    const chart = renderOrUpdateChart('costDistribution', el, {
        type: 'doughnut',
        data: { labels: ['A'], datasets: [{ data: [1] }] },
        options: {},
    });

    assert.equal(created.length, 1);
    assert.equal(chart.canvas, el);
    assert.equal(getChart('costDistribution'), chart);
    assert.equal(chart.updates, 0, 'first render must not call update()');
});

test('renderOrUpdateChart: reuses the instance and refreshes data on later renders', () => {
    const created = installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('cost-chart');

    renderOrUpdateChart('costDistribution', el, {
        type: 'doughnut',
        data: { labels: ['A'], datasets: [{ data: [1] }] },
        options: {},
    });

    renderOrUpdateChart('costDistribution', el, {
        type: 'doughnut',
        data: { labels: ['A', 'B'], datasets: [{ data: [1, 2] }] },
        options: {},
    });

    assert.equal(created.length, 1, 'must not construct a second chart');
    const chart = getChart('costDistribution');
    assert.equal(chart.updates, 1);
    assert.deepEqual(chart.data.labels, ['A', 'B']);
    assert.deepEqual(chart.data.datasets[0].data, [1, 2]);
    assert.equal(chart.destroyed, false);
});

test('renderOrUpdateChart: rebuilds when the canvas element changed', () => {
    const created = installFakeChart();
    setChart('costDistribution', null);

    renderOrUpdateChart('costDistribution', makeCanvas('a'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {},
    });
    const second = renderOrUpdateChart('costDistribution', makeCanvas('b'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {},
    });

    assert.equal(created.length, 2, 'a new canvas needs a new chart');
    assert.equal(getChart('costDistribution'), second);
    assert.equal(created[0].destroyed, true, 'the orphaned chart must be torn down');
});

test('renderOrUpdateChart: rebuilds when the chart type changed', () => {
    const created = installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('a');

    renderOrUpdateChart('costDistribution', el, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {},
    });
    renderOrUpdateChart('costDistribution', el, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [] }] },
        options: {},
    });

    assert.equal(created.length, 2, 'the controller cannot be swapped in place');
});

test('renderOrUpdateChart: refreshes $view so tooltip formatters are not stale', () => {
    installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('a');

    const first = renderOrUpdateChart(
        'costDistribution',
        el,
        { type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] }, options: {} },
        { absTotal: 10 }
    );
    assert.equal(first.$view.absTotal, 10);

    renderOrUpdateChart(
        'costDistribution',
        el,
        { type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] }, options: {} },
        { absTotal: 99 }
    );

    // Same instance, new data — this is the whole point of $view.
    assert.equal(getChart('costDistribution'), first);
    assert.equal(first.$view.absTotal, 99, 'tooltip data must track the latest render');
});

test('renderOrUpdateChart: syncs a shrinking dataset list', () => {
    installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('a');

    const chart = renderOrUpdateChart('costDistribution', el, {
        type: 'bar',
        data: {
            labels: ['x'],
            datasets: [{ data: [1] }, { data: [2] }, { data: [3] }],
        },
        options: {},
    });
    assert.equal(chart.data.datasets.length, 3);

    renderOrUpdateChart('costDistribution', el, {
        type: 'bar',
        data: { labels: ['x'], datasets: [{ data: [9] }] },
        options: {},
    });

    assert.equal(chart.data.datasets.length, 1, 'extra datasets must be truncated');
    assert.deepEqual(chart.data.datasets[0].data, [9]);
});

test('renderOrUpdateChart: merges refreshed options (e.g. mode-dependent axis title)', () => {
    installFakeChart();
    setChart('costDistribution', null);
    const el = makeCanvas('a');

    const chart = renderOrUpdateChart('costDistribution', el, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [] }] },
        options: { scales: { y: { title: { text: '净花费 (¥)' } } } },
    });
    assert.equal(chart.options.scales.y.title.text, '净花费 (¥)');

    renderOrUpdateChart('costDistribution', el, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [] }] },
        options: { scales: { y: { title: { text: '实际净花费 (¥)' } } } },
    });

    assert.equal(
        chart.options.scales.y.title.text,
        '实际净花费 (¥)',
        'options derived from UI controls must be re-applied on update'
    );
});

// --- End-to-end: the doughnut tooltip must reflect the LATEST render ---------
// This is the trap in A6: the formatter is built once at construction, so if it
// closed over the first render's locals the tooltip would keep showing stale
// numbers after an in-place update. Drive the real render twice, then hover.
test('cost chart: tooltip shows updated amounts after an in-place update', async () => {
    installFakeChart();

    const tooltipEl = { style: {}, innerHTML: '', id: 'chartjs-tooltip-0', remove: () => {} };
    const canvas = {
        id: 'cost-distribution-chart',
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        nodeType: 1,
    };
    globalThis.document.getElementById = (id) => {
        if (id === 'cost-distribution-chart') return canvas;
        if (id === tooltipEl.id) return tooltipEl;
        return null;
    };

    const state = await import('../../js/core/state.js');
    const { renderCostDistributionChart } = await import('../../js/charts/cost-distribution.js');

    // Render #1: a single 100-yuan Steam game.
    state.setItems([{ name: 'Game A', type: 'steam', purchasePrice: 100, sellPrice: 0 }]);
    renderCostDistributionChart();
    const chart = state.getChart('costDistribution');
    assert.ok(chart, 'chart should be registered in state');

    // Render #2: the same game now costs 200. The instance must be reused.
    state.setItems([{ name: 'Game A', type: 'steam', purchasePrice: 200, sellPrice: 0 }]);
    renderCostDistributionChart();
    assert.equal(state.getChart('costDistribution'), chart, 'instance must be reused');
    assert.equal(chart.updates, 1, 'second render should go through update()');
    assert.deepEqual(chart.data.datasets[0].data, [200]);

    // Hover: the tooltip must read the current $view, not the first render's.
    // `external` is called with { chart, tooltip } and forwards only `tooltip`
    // to the formatter — matching Chart.js, whose tooltip model carries `.chart`.
    const fakeTooltip = {
        opacity: 1,
        body: [{ lines: ['x'] }],
        title: ['Steam 游戏'],
        dataPoints: [{ dataIndex: 0, parsed: 200, dataset: chart.data.datasets[0] }],
        caretX: 10,
        caretY: 10,
        chart,
    };
    chart.options.plugins.tooltip.external({ chart, tooltip: fakeTooltip });

    assert.match(tooltipEl.innerHTML, /¥200/, 'tooltip must show the updated amount');
    assert.doesNotMatch(tooltipEl.innerHTML, /¥100(?![0-9])/, 'tooltip must not show the stale amount');
});
