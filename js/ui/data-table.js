import { items, sortConfig, setSortConfig, setIsEditingFromList } from '../core/state.js';
import {
    formatCurrency, renderStarsForTable, formatDateForInput, escapeHTML,
    netCost, effectiveRemarks, isUnsoldPhysical,
} from '../core/utils.js';
import { TYPE_MAP, FROM_MAP, STATUS_MAP } from '../config/constants.js';
import { openModal, closeModal } from './modals.js';
import { isAdmin } from './auth.js';
import { setFormMode, resetFormModeMemory } from './item-form.js';
import {
    KPI_FILTERS, sortItems, matchesSearch, paginateItems, formatHours,
} from './table-utils.js';

/**
 * Render the steam data-source indicator (inline after playtime).
 * All states use Font Awesome icons at consistent size.
 */
const renderSteamSource = (item) => {
    const icon = (names, tone, label) =>
        `<span class="steam-source ${tone}" title="${label}" aria-label="${label}"><i class="fas ${names}" aria-hidden="true"></i></span>`;
    if (item.type !== 'steam') return icon('fa-minus', 'text-stone-300', '非 Steam');
    if (!item.steam_app_id) return icon('fa-cloud-slash', 'text-stone-400', '未绑定 Steam');
    if (item.steam_override === false) return icon('fa-cloud-arrow-down', 'text-amber-600', '本地数据');
    return icon('fa-cloud', 'text-emerald-600', 'Steam 同步数据');
};

let detailColsExpanded = false;
let currentPage = 1;
let pageSize = 50;
let activeFilterKey = null;

export const getListPageSize = () => pageSize;
export const getActiveListFilterKey = () => activeFilterKey;
export const resetListPage = () => { currentPage = 1; };
export const setListPageSize = (value) => {
    pageSize = Number(value) >= 0 ? Number(value) : 50;
    currentPage = 1;
};

/**
 * Activate a KPI filter. `all` is treated as "no filter" so the chip does not
 * advertise a restriction that is not there.
 */
export const setListFilter = (key) => {
    activeFilterKey = key && key !== 'all' && KPI_FILTERS[key] ? key : null;
    currentPage = 1;
    updateFilterBar();
};

export const clearListFilter = () => {
    activeFilterKey = null;
    currentPage = 1;
    updateFilterBar();
};

const updateFilterBar = () => {
    const bar = document.getElementById('list-filter-bar');
    const label = document.getElementById('list-filter-label');
    if (!bar) return;
    const filter = activeFilterKey ? KPI_FILTERS[activeFilterKey] : null;
    bar.classList.toggle('is-visible', Boolean(filter));
    if (label) label.textContent = filter ? filter.label : '';
};

const updateSearchClearButton = () => {
    const input = document.getElementById('list-search-input');
    const clearBtn = document.getElementById('clear-list-search-btn');
    if (!clearBtn || !input) return;
    clearBtn.hidden = input.value.length === 0;
};

const setEmptyState = ({ visible, title, hint }) => {
    const box = document.getElementById('no-data-list-message');
    if (!box) return;
    box.classList.toggle('is-visible', visible);
    const titleEl = document.getElementById('no-data-list-text');
    const hintEl = document.getElementById('no-data-list-hint');
    if (titleEl) titleEl.textContent = title;
    if (hintEl) hintEl.textContent = hint || '';
};

const updateResultCount = (shown, total, loading) => {
    const el = document.getElementById('list-result-count');
    if (!el) return;
    if (loading) {
        el.textContent = '正在加载…';
    } else if (total === 0) {
        el.textContent = '共 0 条';
    } else if (shown === total) {
        el.textContent = `共 ${total} 条`;
    } else {
        el.textContent = `筛选出 ${shown} / ${total} 条`;
    }
};

const updatePagination = (pageData) => {
    const container = document.getElementById('table-pagination');
    if (!container) return;
    const visible = pageData.total > 0;
    container.classList.toggle('is-visible', visible);

    const pageInfo = document.getElementById('page-info');
    if (pageInfo) {
        pageInfo.textContent = pageData.total === 0
            ? '第 0 / 0 页'
            : `第 ${pageData.page} / ${pageData.totalPages} 页 · ${pageData.start}–${pageData.end} 条`;
    }
    const prev = document.getElementById('page-prev');
    const next = document.getElementById('page-next');
    if (prev) prev.disabled = !visible || pageData.page <= 1;
    if (next) next.disabled = !visible || pageData.page >= pageData.totalPages;
    const sizeSelect = document.getElementById('page-size-select');
    if (sizeSelect && sizeSelect.value !== String(pageSize)) sizeSelect.value = String(pageSize);
};

/**
 * Render the items data table in the list modal.
 *
 * Search, KPI filtering, sorting and pagination all feed the same pipeline:
 * items → filter → search → sort → page. Rendering rows only for the current
 * page keeps the DOM small and makes Firestore refreshes deterministic.
 */
export const renderItemsList = () => {
    const tbody = document.getElementById('items-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('list-search-input');
    const term = searchInput ? searchInput.value : '';
    const filter = activeFilterKey ? KPI_FILTERS[activeFilterKey] : null;
    const loading = items.length === 0 && document.body.classList.contains('skeleton-loading');

    let filtered = filter ? items.filter(filter.predicate) : [...items];
    filtered = filtered.filter(item => matchesSearch(item, term, detailColsExpanded));
    const sorted = sortItems(filtered, sortConfig);
    const pageData = paginateItems(sorted, currentPage, pageSize);
    // A data refresh may shrink the result set below the current page.
    currentPage = pageData.page;

    tbody.innerHTML = '';
    updateFilterBar();
    updateSearchClearButton();
    updateResultCount(filtered.length, items.length, loading);
    updatePagination(pageData);

    if (items.length === 0) {
        setEmptyState({
            visible: true,
            title: loading ? '正在加载数据…' : '暂无数据',
            hint: loading ? '首次加载可能需要几秒钟，请稍候。' : '登录管理员后可以添加第一条记录。',
        });
        return;
    }

    if (pageData.total === 0) {
        setEmptyState({
            visible: true,
            title: '没有匹配的记录',
            hint: '试试清除筛选，或换一个搜索关键词。',
        });
        return;
    }
    setEmptyState({ visible: false });

    const admin = isAdmin();
    const detailClass = detailColsExpanded ? 'collapsible-col expanded' : 'collapsible-col';

    pageData.items.forEach(item => {
        const cost = netCost(item);
        const cph = item.playTime > 0 ? cost / item.playTime : null;
        const costNote = isUnsoldPhysical(item)
            ? `<span class="ml-1 text-xs text-amber-700">${escapeHTML(effectiveRemarks(item))}</span>`
            : '';

        const row = document.createElement('tr');
        const baseClass = 'border-b border-stone-200 hover:bg-stone-100 cursor-pointer';
        const statusClass = item.status && item.status !== 'empty' ? `status-${item.status}-row` : '';
        const classes = [baseClass];
        if (item.fullyCompleted) classes.push('achievement-gold-row');
        if (statusClass && !item.fullyCompleted) classes.push(statusClass);
        row.className = classes.join(' ');
        row.dataset.fb_id = item.fb_id;
        if (admin) {
            row.tabIndex = 0;
            row.setAttribute('aria-label', `编辑 ${item.name || ''}`.trim());
            row.title = '点击或按回车编辑';
        }

        const fullName = item.fullyCompleted
            ? `<span class="achievement-name"><i class="fas fa-trophy achievement-name-trophy" aria-hidden="true"></i> ${escapeHTML(item.name)}</span>`
            : (escapeHTML(item.name) || '/');

        row.innerHTML = `
            <td class="px-4 py-3 font-mono whitespace-nowrap num">${escapeHTML(item.id) || '/'}</td>
            <td class="px-4 py-3 font-medium">${fullName}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHTML(item.sort) || '/'}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">${renderStarsForTable(item.rating)}</td>
            <td class="px-4 py-3 whitespace-nowrap num">${formatHours(item.playTime)} ${renderSteamSource(item)}</td>
            <td class="px-4 py-3 whitespace-nowrap num">${escapeHTML(item.passDate) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap num ${detailClass}">${escapeHTML(item.purchaseDate) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap num ${detailClass}">${escapeHTML(item.startDate) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap num ${detailClass}">${item.purchasePrice != null ? formatCurrency(item.purchasePrice) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap num">${formatCurrency(cost)}${costNote}</td>
            <td class="px-4 py-3 whitespace-nowrap num">${cph != null && Number.isFinite(cph) ? formatCurrency(cph) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap ${detailClass}">${escapeHTML(FROM_MAP[item.from]) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap ${detailClass}">${escapeHTML(TYPE_MAP[item.type] || item.type) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHTML(STATUS_MAP[item.status]) || '/'}</td>`;
        tbody.appendChild(row);
    });
};

/**
 * Update sort header indicators (▾ / ▴), aria-sort and focus affordances.
 */
export const updateSortHeaders = () => {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const key = header.dataset.sort;
        const base = header.dataset.label || header.textContent.replace(/[▾▴]/g, '').trim();
        header.dataset.label = base;
        const isSorted = sortConfig.key !== '_default' && key === sortConfig.key;
        header.textContent = isSorted
            ? `${base} ${sortConfig.direction === 'desc' ? '▾' : '▴'}`
            : base;
        header.setAttribute('aria-sort', isSorted
            ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
            : 'none');
        header.title = isSorted ? '点击切换排序方向' : '点击按此列排序';
    });
};

/**
 * Setup sort header click + keyboard handlers.
 */
export const setupSortHeaders = () => {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const sortKey = header.dataset.sort;
        if (!sortKey) return;
        header.tabIndex = 0;
        header.setAttribute('aria-controls', 'items-table');
        header.title = '点击按此列排序';

        const activate = () => {
            if (sortConfig.key === sortKey) {
                setSortConfig(sortKey, sortConfig.direction === 'asc' ? 'desc' : 'asc');
            } else {
                setSortConfig(sortKey, 'desc');
            }
            currentPage = 1;
            renderItemsList();
            updateSortHeaders();
        };

        header.addEventListener('click', activate);
        header.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            activate();
        });
    });
    updateSortHeaders();
};

/**
 * Setup search input filtering for the list modal.
 */
export const setupListSearch = () => {
    const searchInput = document.getElementById('list-search-input');
    if (!searchInput) return;

    let debounceTimer;
    const apply = () => {
        currentPage = 1;
        updateSearchClearButton();
        renderItemsList();
    };

    searchInput.addEventListener('input', (e) => {
        if (e.isComposing) return;
        updateSearchClearButton();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(apply, 150);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!searchInput.value) return; // empty search: let Esc close the modal
        e.preventDefault();
        e.stopPropagation();
        searchInput.value = '';
        clearTimeout(debounceTimer);
        apply();
    });

    const clearBtn = document.getElementById('clear-list-search-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearTimeout(debounceTimer);
            apply();
            searchInput.focus();
        });
    }

    updateSearchClearButton();
};

/**
 * Setup the detail columns expand/collapse toggle button.
 */
export const setupDetailColsToggle = () => {
    const toggleBtn = document.getElementById('toggle-detail-cols');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        detailColsExpanded = !detailColsExpanded;
        document.querySelectorAll('th.collapsible-col').forEach(col => {
            col.classList.toggle('expanded', detailColsExpanded);
        });
        toggleBtn.setAttribute('aria-expanded', String(detailColsExpanded));
        toggleBtn.innerHTML = detailColsExpanded
            ? '<i class="fas fa-caret-up" aria-hidden="true"></i> 折叠详情'
            : '<i class="fas fa-caret-down" aria-hidden="true"></i> 展开详情';
        // Rendering also re-applies the search against the newly visible fields.
        renderItemsList();
    });
};

/** Setup KPI filter chip + pagination controls. */
export const setupListFilterBar = () => {
    const clearBtn = document.getElementById('clear-list-filter-btn');
    if (!clearBtn) return;
    clearBtn.addEventListener('click', () => {
        clearListFilter();
        renderItemsList();
    });
};

export const setupListPagination = () => {
    const prev = document.getElementById('page-prev');
    const next = document.getElementById('page-next');
    const sizeSelect = document.getElementById('page-size-select');

    if (prev) {
        prev.addEventListener('click', () => {
            currentPage = Math.max(1, currentPage - 1);
            renderItemsList();
        });
    }
    if (next) {
        next.addEventListener('click', () => {
            currentPage += 1;
            renderItemsList();
        });
    }
    if (sizeSelect) {
        sizeSelect.value = String(pageSize);
        sizeSelect.addEventListener('change', () => {
            setListPageSize(sizeSelect.value);
            renderItemsList();
        });
    }
};

/**
 * Setup delegated row click / keyboard handler for the items table.
 */
export const setupItemsTableClick = () => {
    const tbody = document.getElementById('items-table-body');
    if (!tbody) return;
    // Use a flag to ensure the handler is only registered once.
    if (tbody.dataset._delegated === 'true') return;
    tbody.dataset._delegated = 'true';

    tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-fb_id]');
        if (!row) return;
        handleEditItem(row.dataset.fb_id);
    });
    tbody.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('tr[data-fb_id]');
        if (!row) return;
        e.preventDefault();
        handleEditItem(row.dataset.fb_id);
    });
};

/**
 * Handle editing an item from the list.
 * Opens the item edit modal pre-filled with the item's data.
 */
export const handleEditItem = (fbId) => {
    if (!isAdmin()) return;

    const item = items.find(i => i.fb_id === fbId);
    if (!item) return;

    setIsEditingFromList(true);

    const listModal = document.getElementById('list-modal');
    const itemModal = document.getElementById('item-modal');

    document.getElementById('modal-title').textContent = '编辑记录';
    document.getElementById('item-form').reset();
    document.getElementById('item-id').value = item.fb_id;
    document.getElementById('item-custom-id').value = item.id || '';
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-sort').value = item.sort || '';
    document.getElementById('purchase-date').value = formatDateForInput(item.purchaseDate);
    document.getElementById('start-date').value = formatDateForInput(item.startDate);

    const isDrama = item.type === 'drama';
    resetFormModeMemory();
    setFormMode(isDrama ? 'drama' : 'game');

    if (isDrama) {
        document.getElementById('episode-count').value = item.episodeCount ?? '';
        document.getElementById('episode-duration').value = item.episodeDuration ?? '';
        const count = item.episodeCount ?? 0;
        const duration = item.episodeDuration ?? 0;
        const calculatedTime = document.getElementById('calculated-time');
        if (calculatedTime && count > 0 && duration > 0) {
            calculatedTime.textContent = `${(count * duration / 60).toFixed(2)} 小时`;
        }
        document.getElementById('item-status-drama').value = item.status || 'empty';
        document.getElementById('item-rating-drama').value = item.rating ?? '';
        document.getElementById('pass-date-drama').value = formatDateForInput(item.passDate);
        document.getElementById('pass-date-container-drama').classList.toggle('hidden', item.status !== 'passed');
        const dramaTypeSelect = document.getElementById('drama-type');
        if (dramaTypeSelect) {
            const sortVal = item.sort || '';
            const match = Array.from(dramaTypeSelect.options).find(o => o.value === sortVal);
            dramaTypeSelect.value = match ? sortVal : '';
        }
    } else {
        document.getElementById('item-from').value = item.from || 'purchase';
        document.getElementById('purchase-price').value = item.purchasePrice ?? '';
        document.getElementById('item-type').value = item.type;
        document.getElementById('play-time').value = item.playTime ?? '';
        document.getElementById('item-status').value = item.status || 'empty';
        document.getElementById('item-rating').value = item.rating ?? '';
        document.getElementById('pass-date').value = formatDateForInput(item.passDate);
        document.getElementById('pass-date-container').classList.toggle('hidden', item.status !== 'passed');
        document.getElementById('sell-date').value = formatDateForInput(item.sellDate);
        document.getElementById('sell-price').value = item.sellPrice ?? '';

        const steamFields = document.getElementById('steam-fields');
        if (steamFields) steamFields.classList.toggle('hidden', item.type !== 'steam');
        const steamAppIdInput = document.getElementById('steam-app-id');
        if (steamAppIdInput) steamAppIdInput.value = item.steam_app_id ?? '';
        const steamOverrideCheckbox = document.getElementById('steam-override');
        if (steamOverrideCheckbox) steamOverrideCheckbox.checked = item.steam_override !== false;

        const fullyCompletedCheckbox = document.getElementById('fully-completed');
        if (fullyCompletedCheckbox) fullyCompletedCheckbox.checked = !!item.fullyCompleted;

        document.getElementById('item-remarks').value = item.remarks || '';
    }

    document.getElementById('delete-btn').classList.remove('hidden');

    closeModal(listModal);
    openModal(itemModal);
};

/**
 * Open the detail table, optionally filtered from a KPI card.
 * Shared by the "查看数据详情" button and the clickable KPI metrics.
 */
export const openListModal = (filterKey = null, { resetSort = true } = {}) => {
    const listModal = document.getElementById('list-modal');
    if (!listModal) return;
    const title = document.getElementById('list-modal-title');
    const searchInput = document.getElementById('list-search-input');
    if (title) title.textContent = '数据详情';
    if (searchInput) searchInput.value = '';
    if (resetSort) setSortConfig('_default', 'desc');
    setListFilter(filterKey);
    renderItemsList();
    updateSortHeaders();
    openModal(listModal);
};
