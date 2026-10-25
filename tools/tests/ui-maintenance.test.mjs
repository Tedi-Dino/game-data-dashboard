import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    isGameItem, isDramaItem, getSortValue, sortItems, getSearchableText,
    matchesSearch, paginateItems, formatHours, KPI_FILTERS, KPI_FILTER_BY_ELEMENT,
} from '../../js/ui/table-utils.js';
import { CHART_FIELDS, buildChartSignature, buildItemsHash } from '../../js/ui/chart-signature.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// --- Table helpers ----------------------------------------------------------

const game = (overrides = {}) => ({
    fb_id: 'fb', id: 'g1', name: 'Game', sort: 'RPG', type: 'steam',
    from: 'purchase', purchasePrice: 100, sellPrice: null, playTime: 10,
    status: 'playing', rating: 8, purchaseDate: '2024-01-10',
    startDate: '2024-01-15', passDate: null, remarks: null, ...overrides,
});

test('table helpers: game/drama classification', () => {
    assert.equal(isGameItem({ type: 'steam' }), true);
    assert.equal(isGameItem({ type: 'hardware' }), false);
    assert.equal(isGameItem({ type: 'drama' }), false);
    assert.equal(isDramaItem({ type: 'drama' }), true);
    assert.equal(isDramaItem({ type: 'steam' }), false);
});

test('table helpers: single-column sort is stable, directional and non-mutating', () => {
    const source = [
        game({ id: 'b', rating: 5 }),
        game({ id: 'a', rating: 9 }),
        game({ id: 'c', rating: 7 }),
    ];
    const asc = sortItems(source, { key: 'id', direction: 'asc' });
    assert.deepEqual(asc.map(i => i.id), ['a', 'b', 'c']);
    const desc = sortItems(source, { key: 'rating', direction: 'desc' });
    assert.deepEqual(desc.map(i => i.id), ['a', 'c', 'b']);
    assert.deepEqual(source.map(i => i.id), ['b', 'a', 'c'], 'source array must not be reordered');
});

test('table helpers: default sort puts playing → passed → rest', () => {
    const playing = game({
        id: 'playing', status: 'playing', startDate: '2023-01-01', purchaseDate: '2023-01-01',
    });
    const passed = game({
        id: 'passed', status: 'passed', startDate: '2022-01-01', passDate: '2024-01-01',
        purchaseDate: '2022-01-01',
    });
    const newerBacklog = game({
        id: 'newer', status: 'backlog', purchaseDate: '2025-01-01',
    });
    const olderBacklog = game({
        id: 'older', status: 'empty', purchaseDate: '2020-01-01',
    });
    const sorted = sortItems([newerBacklog, passed, olderBacklog, playing], { key: '_default' });
    assert.deepEqual(sorted.map(i => i.id), ['playing', 'passed', 'newer', 'older']);
});

test('table helpers: two passed games sort newest pass date first', () => {
    const oldPass = game({ id: 'old', status: 'passed', passDate: '2023-05-01' });
    const newPass = game({ id: 'new', status: 'passed', passDate: '2025-02-01' });
    assert.deepEqual(sortItems([oldPass, newPass], { key: '_default' }).map(i => i.id), ['new', 'old']);
});

test('table helpers: games without playtime sort as Infinity for cost per hour', () => {
    const played = game({ id: 'played', playTime: 10, purchasePrice: 100 });
    const unplayed = game({ id: 'unplayed', playTime: 0, purchasePrice: 10 });
    const asc = sortItems([unplayed, played], { key: 'costPerHour', direction: 'asc' });
    assert.deepEqual(asc.map(i => i.id), ['played', 'unplayed']);
    assert.equal(getSortValue(unplayed, 'costPerHour'), Infinity);
});

test('table helpers: search excludes collapsed detail columns until expanded', () => {
    const item = game({ type: 'steam', from: 'friend', name: 'Hades', sort: 'Action' });
    const collapsed = getSearchableText(item, false);
    assert.equal(collapsed.includes('steam'), false);
    assert.equal(matchesSearch(item, 'steam', false), false);
    assert.equal(matchesSearch(item, 'steam', true), true);
    assert.equal(matchesSearch(item, 'friend', true), true);
    assert.equal(matchesSearch(item, 'Hades', false), true);
});

test('table helpers: search includes effective remarks and completion marker', () => {
    const item = game({
        type: 'physical', name: 'Cartridge', remarks: null, fullyCompleted: true,
    });
    assert.equal(matchesSearch(item, '预估值'), true);
    assert.equal(matchesSearch(item, '全成就'), true);
});

test('table helpers: pagination clamps pages and supports "all"', () => {
    const list = Array.from({ length: 11 }, (_, i) => game({ id: `g${i}` }));
    const page2 = paginateItems(list, 2, 5);
    assert.equal(page2.totalPages, 3);
    assert.equal(page2.page, 2);
    assert.equal(page2.start, 6);
    assert.equal(page2.end, 10);
    assert.equal(page2.items.length, 5);

    const clamped = paginateItems(list, 99, 5);
    assert.equal(clamped.page, 3);
    assert.equal(clamped.items.length, 1);

    const all = paginateItems(list, 3, 0);
    assert.equal(all.page, 1);
    assert.equal(all.totalPages, 1);
    assert.equal(all.items.length, 11);
    assert.equal(all.start, 1);
    assert.equal(all.end, 11);

    const empty = paginateItems([], 1, 50);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.start, 0);
});

test('table helpers: hours formatting is consistent and null-safe', () => {
    assert.equal(formatHours(10), '10.00h');
    assert.equal(formatHours('2.5'), '2.50h');
    assert.equal(formatHours(null), '/');
    assert.equal(formatHours(undefined), '/');
});

// --- KPI filters ------------------------------------------------------------

test('KPI filters: every metric maps to a real predicate', () => {
    for (const [elementId, key] of Object.entries(KPI_FILTER_BY_ELEMENT)) {
        assert.ok(KPI_FILTERS[key], `${elementId} maps to missing filter ${key}`);
        assert.equal(typeof KPI_FILTERS[key].predicate, 'function');
        assert.ok(KPI_FILTERS[key].label);
    }
});

test('KPI filters: populations match their labels', () => {
    const playingGame = game({ type: 'steam', status: 'playing', playTime: 10, from: 'purchase' });
    const passedGame = game({ type: 'physical', status: 'passed', playTime: 0, from: 'purchase' });
    const freeGame = game({ type: 'digital', status: 'backlog', playTime: 0, from: 'free' });
    const hardware = game({ type: 'hardware', status: 'empty', playTime: 0, from: 'purchase' });
    const watchedDrama = game({ type: 'drama', status: 'passed', playTime: 4, from: 'free' });
    const backlogDrama = game({ type: 'drama', status: 'backlog', playTime: 0, from: 'free' });
    const all = [playingGame, passedGame, freeGame, hardware, watchedDrama, backlogDrama];

    assert.equal(all.filter(KPI_FILTERS.all.predicate).length, 6);
    assert.equal(all.filter(KPI_FILTERS.games.predicate).length, 3);
    assert.deepEqual(all.filter(KPI_FILTERS.hardware.predicate), [hardware]);
    assert.equal(all.filter(KPI_FILTERS.unfinishedGames.predicate).length, 2);
    assert.equal(all.filter(KPI_FILTERS.playedGames.predicate).length, 1);
    assert.equal(all.filter(KPI_FILTERS.paidGames.predicate).length, 2);
    assert.equal(all.filter(KPI_FILTERS.dramas.predicate).length, 2);
    assert.deepEqual(all.filter(KPI_FILTERS.watchedDramas.predicate), [watchedDrama]);
});

// --- Chart signatures -------------------------------------------------------

test('chart signatures: every chart declares the fields used for invalidation', () => {
    for (const name of ['cost', 'time', 'scatter', 'monthly', 'genre']) {
        assert.ok(Array.isArray(CHART_FIELDS[name]));
        assert.ok(CHART_FIELDS[name].length > 0);
    }
    assert.ok(CHART_FIELDS.monthly.includes('steam_app_id'));
    assert.ok(CHART_FIELDS.monthly.includes('steam_override'));
});

test('chart signatures: Steam binding changes invalidate the monthly chart', () => {
    const base = [game({ id: 'a' })];
    const bound = [{ ...base[0], steam_app_id: 12345 }];
    const sigA = buildChartSignature(base, 'monthly', 'steam-1', '2026-10-25');
    const sigB = buildChartSignature(bound, 'monthly', 'steam-1', '2026-10-25');
    assert.notEqual(sigA, sigB);
});

test('chart signatures: remarks and cost fields invalidate the cost chart', () => {
    const a = buildChartSignature([game({ remarks: null })], 'cost');
    const b = buildChartSignature([game({ remarks: '预估值' })], 'cost');
    const c = buildChartSignature([game({ purchasePrice: 120 })], 'cost');
    const d = buildChartSignature([game({ sellDate: '2026-01-01', sellPrice: 50 })], 'cost');
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
});

test('chart signatures: monthly chart also depends on the local day', () => {
    const list = [game()];
    assert.notEqual(
        buildChartSignature(list, 'monthly', 'same', '2026-10-25'),
        buildChartSignature(list, 'monthly', 'same', '2026-10-26'),
    );
});

test('items hash: completion and Steam fields trigger a dashboard update', () => {
    const base = [game()];
    assert.notEqual(buildItemsHash(base), buildItemsHash([game({ fullyCompleted: true })]));
    assert.notEqual(buildItemsHash(base), buildItemsHash([game({ steam_override: false })]));
    assert.equal(buildItemsHash(base, 'steam'), buildItemsHash(base, 'steam'));
});

// --- Static front-end contract ----------------------------------------------

test('markup: every KPI metric is a keyboard-operable filter entry', () => {
    const html = read('../../index.html');
    const tags = html.match(/<[^>]*\bdata-kpi-filter="[^"]+"[^>]*>/g) || [];
    assert.equal(tags.length, Object.keys(KPI_FILTER_BY_ELEMENT).length);
    for (const tag of tags) {
        assert.match(tag, /\brole="button"/);
        assert.match(tag, /\btabindex="0"/);
        assert.match(tag, /\baria-label="[^"]+"/);
    }
    for (const elementId of Object.keys(KPI_FILTER_BY_ELEMENT)) {
        assert.ok(html.includes(`id="${elementId}"`), `missing KPI element #${elementId}`);
    }
});

test('markup: list modal exposes filter, search, pagination and empty-state hooks', () => {
    const html = read('../../index.html');
    for (const id of [
        'list-filter-bar', 'list-filter-label', 'clear-list-filter-btn',
        'clear-list-search-btn', 'list-result-count', 'items-table', 'items-table-body',
        'no-data-list-message', 'no-data-list-text', 'no-data-list-hint',
        'table-pagination', 'page-size-select', 'page-prev', 'page-info', 'page-next',
        'toast-region', 'app-status', 'user-role',
    ]) {
        assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
    assert.match(html, /<table[^>]*id="items-table"[^>]*aria-describedby="list-result-count"/);
    assert.match(html, /<caption[^>]*>游戏、硬件与剧集记录/);
    assert.match(html, /id="page-size-select"[\s\S]*?<option value="0">全部<\/option>/);
});

test('markup: FAB trigger is a real button with expanded state', () => {
    const html = read('../../index.html');
    assert.match(html, /<button[^>]*id="add-item-fab"[^>]*aria-expanded="false"/);
    assert.equal(/<div[^>]*id="add-item-fab"/.test(html), false);
});

test('markup: charts provide an empty-state element and accessible labels', () => {
    const html = read('../../index.html');
    for (const id of [
        'cost-distribution-empty', 'time-distribution-empty', 'game-sort-empty',
        'game-distribution-empty', 'monthly-trends-empty',
    ]) {
        assert.ok(html.includes(`id="${id}"`), `missing chart empty state #${id}`);
    }
    assert.match(html, /id="game-distribution-chart"[^>]*aria-label="[^"]+"/);
    assert.match(html, /id="monthly-trends-chart"[^>]*aria-label="[^"]+"/);
});

test('layout: desktop KPI row is 4/4/4 and charts use an 8/4 main-secondary split', () => {
    const html = read('../../index.html');
    const openingTag = (id) => html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`))?.[0] || '';

    for (const id of ['kpi-card-1', 'kpi-card-2', 'kpi-card-3']) {
        assert.match(openingTag(id), /xl:col-span-4/, `${id} must share the overview row`);
    }
    assert.match(openingTag('chart-card-3'), /xl:col-span-8/, 'monthly trend is the main chart');
    assert.match(openingTag('chart-card-2'), /xl:col-span-4/, 'scatter chart is secondary');
    assert.match(openingTag('chart-card-all-doughnuts'), /xl:col-span-12/, 'doughnuts share one strip');

    // DOM order drives the phone reading order: the main chart must come first.
    const monthly = html.indexOf('id="chart-card-3"');
    const scatter = html.indexOf('id="chart-card-2"');
    const doughnuts = html.indexOf('id="chart-card-all-doughnuts"');
    assert.ok(monthly < scatter && scatter < doughnuts, 'phone order should be monthly → scatter → doughnuts');
});

test('scripts: main.js uses the tested filter, signature and list helpers', () => {
    const main = read('../../js/main.js');
    for (const token of [
        'setupKpiFilters', 'setupListFilterBar', 'setupListPagination', 'openListModal',
        'buildChartSignature', 'buildItemsHash', 'showToast',
    ]) {
        assert.ok(main.includes(token), `main.js does not use ${token}`);
    }
});

test('confirm dialog settles true before the close lifecycle can settle false', () => {
    const source = read('../../js/ui/modals.js');
    // Regression guard: the shared close hook resolves confirmations as false,
    // so the OK click must settle(true) before calling closeModal(). Scope the
    // search to showConfirmation: showAlert has a separate, OK-only handler.
    const confirmBlock = source.slice(source.indexOf('export const showConfirmation'));
    const handlerStart = confirmBlock.indexOf("newOkBtn.addEventListener('click'");
    const handlerEnd = confirmBlock.indexOf("newCancelBtn.addEventListener", handlerStart);
    const okHandler = confirmBlock.slice(handlerStart, handlerEnd);
    assert.ok(handlerStart > 0 && okHandler.includes('settle(true)'));
    assert.ok(okHandler.indexOf('settle(true)') < okHandler.indexOf('closeModal(modal)'));
});

test('fullscreen chart has exactly one opener listener', () => {
    const source = read('../../js/ui/chart-controls.js');
    const openers = source.match(/openModal\(fullscreenModal\)/g) || [];
    assert.equal(openers.length, 1, 'duplicate fullscreen click handler would render twice');
});

test('charts: empty states and negative-value axes stay wired', () => {
    const cost = read('../../js/charts/cost-distribution.js');
    const scatter = read('../../js/charts/game-distribution.js');
    const monthly = read('../../js/charts/monthly-trends.js');
    assert.match(cost, /setChartEmptyState\('cost-distribution-empty'/);
    assert.match(scatter, /setChartEmptyState\('game-distribution-empty'/);
    assert.match(scatter, /beginAtZero:\s*false/);
    assert.match(monthly, /beginAtZero:\s*false/);
    assert.match(scatter, /aria-label/);
});

test('styles: contrast-safe KPI color and no perpetual achievement animation', () => {
    const css = read('../../css/style.css');
    // Comments may reference the old color; only declarations matter here.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(css, /\.kpi-primary\s*\{\s*color:\s*var\(--amber-700\)/);
    assert.equal(/#f5b642/i.test(rules), false);
    assert.equal(rules.includes('achievement-shimmer'), false);
    assert.equal(rules.includes('trophy-bounce'), false);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.skip-link/);
    assert.match(css, /\.table-pagination\.is-visible/);
    assert.match(css, /\.toast-region/);
});
