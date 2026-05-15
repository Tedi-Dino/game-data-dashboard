import { items, sortConfig, setSortConfig, setIsEditingFromList } from '../core/state.js';
import { formatCurrency, renderStarsForTable, formatDateForInput, escapeHTML } from '../core/utils.js';
import { TYPE_MAP, FROM_MAP, STATUS_MAP } from '../config/constants.js';
import { openModal, closeModal } from './modals.js';
import { isAdmin } from './auth.js';
import { setFormMode } from './item-form.js';

/**
 * Render the steam data-source indicator (inline after playtime).
 * All states use Font Awesome icons at consistent size.
 */
const renderSteamSource = (item) => {
    if (item.type !== 'steam') return '<span class="steam-source text-stone-300" title="非 Steam"><i class="fas fa-minus"></i></span>';
    if (!item.steam_app_id) return '<span class="steam-source text-stone-400" title="未绑定"><i class="fas fa-cloud-slash"></i></span>';
    if (item.steam_override === false) return '<span class="steam-source text-amber-500" title="本地数据"><i class="fas fa-cloud-arrow-down"></i></span>';
    return '<span class="steam-source text-emerald-500" title="Steam 云端"><i class="fas fa-cloud"></i></span>';
};

let detailColsExpanded = false;

/**
 * Setup the detail columns expand/collapse toggle button.
 */
export const setupDetailColsToggle = () => {
    const toggleBtn = document.getElementById('toggle-detail-cols');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        detailColsExpanded = !detailColsExpanded;
        const cols = document.querySelectorAll('.collapsible-col');
        cols.forEach(col => col.classList.toggle('expanded', detailColsExpanded));

        const icon = toggleBtn.querySelector('i');
        if (detailColsExpanded) {
            toggleBtn.innerHTML = '<i class="fas fa-caret-up"></i> 折叠详情';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-caret-down"></i> 展开详情';
        }
    });
};

/**
 * Render the items data table in the list modal.
 */
export const renderItemsList = () => {
    const tbody = document.getElementById('items-table-body');
    const noDataMsg = document.getElementById('no-data-list-message');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (items.length === 0) {
        if (noDataMsg) noDataMsg.classList.remove('hidden');
        return;
    }
    if (noDataMsg) noDataMsg.classList.add('hidden');

    // Sort items
    const getDateVal = (item, key) => {
        const raw = item[key];
        return raw ? new Date(raw).getTime() : -Infinity;
    };

    const sorted = [...items].sort((a, b) => {
        // Multi-tier default sort
        if (sortConfig.key === '_default') {
            const statusOrder = { playing: 0, passed: 1 };
            const aStatus = statusOrder[a.status] ?? 2;
            const bStatus = statusOrder[b.status] ?? 2;
            if (aStatus !== bStatus) return aStatus - bStatus;

            if (a.status === 'playing') {
                const aDate = getDateVal(a, 'purchaseDate');
                const bDate = getDateVal(b, 'purchaseDate');
                return aDate - bDate;
            }
            if (a.status === 'passed') {
                const aDate = getDateVal(a, 'passDate');
                const bDate = getDateVal(b, 'passDate');
                return bDate - aDate;
            }
            const aDate = getDateVal(a, 'purchaseDate');
            const bDate = getDateVal(b, 'purchaseDate');
            return bDate - aDate;
        }

        // Single-key sort
        const getVal = (item, key) => {
            const cost = (item.purchasePrice || 0) - (item.sellPrice || 0);
            switch (key) {
                case 'id': return item.id || '';
                case 'name': return item.name || '';
                case 'sort': return item.sort || '';
                case 'type': return item.type || '';
                case 'from': return item.from || '';
                case 'status': return item.status || '';
                case 'purchaseDate': return getDateVal(item, 'purchaseDate');
                case 'passDate': return getDateVal(item, 'passDate');
                case 'purchasePrice': return item.purchasePrice ?? -1;
                case 'actualCost': return cost;
                case 'playTime': return item.playTime ?? -1;
                case 'costPerHour': return (!item.playTime || item.playTime <= 0 ? Infinity : cost / item.playTime);
                case 'rating': return item.rating ?? 0;
                case 'steam': return item.steam_app_id ? 1 : 0;
                default: return '';
            }
        };

        const valA = getVal(a, sortConfig.key);
        const valB = getVal(b, sortConfig.key);
        const comparison = (typeof valA === 'string' && typeof valB === 'string')
            ? valA.localeCompare(valB, 'zh-CN')
            : (valA < valB ? -1 : (valA > valB ? 1 : 0));
        return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    sorted.forEach(item => {
        const cost = (item.purchasePrice || 0) - (item.sellPrice || 0);
        const cph = item.playTime > 0 ? cost / item.playTime : null;

        const row = document.createElement('tr');
        const baseClass = 'border-b border-stone-200 hover:bg-stone-100 cursor-pointer';
        const statusClass = item.status && item.status !== 'empty' ? `status-${item.status}-row` : '';
        const classes = [baseClass];
        if (item.fullyCompleted) classes.push('achievement-gold-row');
        if (statusClass) classes.push(statusClass);
        row.className = classes.join(' ');
        row.dataset.fb_id = item.fb_id;
        row.innerHTML = `
            <td class="px-4 py-3 font-mono whitespace-nowrap">${escapeHTML(item.id) || '/'}</td>
            <td class="px-4 py-3 font-medium">${item.fullyCompleted ? `<span class="achievement-name"><i class="fas fa-trophy achievement-name-trophy"></i> ${escapeHTML(item.name)}</span>` : escapeHTML(item.name) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHTML(item.sort) || '/'}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">${renderStarsForTable(item.rating)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.playTime != null ? `${item.playTime}h` : '/'} ${renderSteamSource(item)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHTML(item.passDate) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap collapsible-col">${escapeHTML(item.purchaseDate) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap collapsible-col">${item.purchasePrice != null ? formatCurrency(item.purchasePrice) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${formatCurrency(cost)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${cph != null && isFinite(cph) ? formatCurrency(cph) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap collapsible-col">${escapeHTML(FROM_MAP[item.from]) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap collapsible-col">${escapeHTML(TYPE_MAP[item.type] || item.type) || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${escapeHTML(STATUS_MAP[item.status]) || '/'}</td>`;
        row.addEventListener('click', () => handleEditItem(item.fb_id));
        tbody.appendChild(row);
    });
};

/**
 * Update sort header indicators (▾ / ▴).
 */
export const updateSortHeaders = () => {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const key = header.dataset.sort;
        let text = header.textContent.replace(/[▾▴]/, '').trim();
        if (sortConfig.key !== '_default' && key === sortConfig.key) {
            header.textContent = `${text} ${sortConfig.direction === 'desc' ? '▾' : '▴'}`;
        } else {
            header.textContent = text;
        }
    });
};

/**
 * Setup sort header click handlers.
 */
export const setupSortHeaders = () => {
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;
            if (sortConfig.key === sortKey) {
                setSortConfig(sortKey, sortConfig.direction === 'asc' ? 'desc' : 'asc');
            } else {
                setSortConfig(sortKey, 'desc');
            }
            renderItemsList();
            updateSortHeaders();
        });
    });
};

/**
 * Setup search input filtering for the list modal.
 */
export const setupListSearch = () => {
    const searchInput = document.getElementById('list-search-input');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.addEventListener('keyup', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const term = searchInput.value.toLowerCase();
            const tbody = document.getElementById('items-table-body');
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        }, 150);
    });
};

/**
 * Handle editing an item from the list.
 * Opens the item edit modal pre-filled with the item's data.
 */
const handleEditItem = (fbId) => {
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

    const isDrama = item.type === 'drama';
    setFormMode(isDrama ? 'drama' : 'game');

    if (isDrama) {
        document.getElementById('episode-count').value = item.episodeCount ?? '';
        document.getElementById('episode-duration').value = item.episodeDuration ?? '';
        // Update calculated time display
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

        // Steam fields
        const steamFields = document.getElementById('steam-fields');
        if (steamFields) steamFields.classList.toggle('hidden', item.type !== 'steam');
        const steamAppIdInput = document.getElementById('steam-app-id');
        if (steamAppIdInput) steamAppIdInput.value = item.steam_app_id ?? '';
        const steamOverrideCheckbox = document.getElementById('steam-override');
        if (steamOverrideCheckbox) steamOverrideCheckbox.checked = item.steam_override !== false;

        // Achievement completion checkbox
        const fullyCompletedCheckbox = document.getElementById('fully-completed');
        if (fullyCompletedCheckbox) fullyCompletedCheckbox.checked = !!item.fullyCompleted;
    }

    document.getElementById('delete-btn').classList.remove('hidden');

    closeModal(listModal);
    openModal(itemModal);
};
