import { items, sortConfig, setSortConfig, setIsEditingFromList } from '../core/state.js';
import { formatCurrency, renderStarsForTable } from '../core/utils.js';
import { TYPE_MAP, FROM_MAP, STATUS_MAP } from '../config/constants.js';
import { openModal, closeModal } from './modals.js';
import { isAdmin } from './auth.js';

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
    const sorted = [...items].sort((a, b) => {
        const getVal = (item, key) => {
            const cost = (item.purchasePrice || 0) - (item.sellPrice || 0);
            switch (key) {
                case 'id': return item.id || '';
                case 'name': return item.name || '';
                case 'sort': return item.sort || '';
                case 'type': return item.type || '';
                case 'from': return item.from || '';
                case 'status': return item.status || '';
                case 'purchaseDate': return item.purchaseDate ? new Date(item.purchaseDate).getTime() : -Infinity;
                case 'passDate': return item.passDate ? new Date(item.passDate).getTime() : -Infinity;
                case 'purchasePrice': return item.purchasePrice ?? -1;
                case 'actualCost': return cost;
                case 'playTime': return item.playTime ?? -1;
                case 'costPerHour': return (!item.playTime || item.playTime <= 0 ? Infinity : cost / item.playTime);
                case 'rating': return item.rating ?? 0;
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
        row.className = 'border-b border-gray-600 hover:bg-gray-600 cursor-pointer';
        row.dataset.fb_id = item.fb_id;
        row.innerHTML = `
            <td class="px-4 py-3 font-mono whitespace-nowrap">${item.id || '/'}</td>
            <td class="px-4 py-3 font-medium">${item.name || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.sort || '/'}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">${renderStarsForTable(item.rating)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.playTime != null ? `${item.playTime}h` : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${STATUS_MAP[item.status] || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.passDate || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.purchaseDate || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${item.purchasePrice != null ? formatCurrency(item.purchasePrice) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${formatCurrency(cost)}</td>
            <td class="px-4 py-3 whitespace-nowrap">${cph != null && isFinite(cph) ? formatCurrency(cph) : '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${FROM_MAP[item.from] || '/'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${TYPE_MAP[item.type] || item.type || '/'}</td>`;
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
        if (key === sortConfig.key) {
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

    searchInput.addEventListener('keyup', () => {
        const term = searchInput.value.toLowerCase();
        const tbody = document.getElementById('items-table-body');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
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
    document.getElementById('item-type').value = item.type;
    document.getElementById('item-from').value = item.from || 'purchase';
    document.getElementById('purchase-date').value = item.purchaseDate || '';
    document.getElementById('purchase-price').value = item.purchasePrice ?? '';
    document.getElementById('play-time').value = item.playTime ?? '';
    document.getElementById('item-status').value = item.status || 'empty';
    document.getElementById('pass-date').value = item.passDate || '';
    document.getElementById('sell-date').value = item.sellDate || '';
    document.getElementById('sell-price').value = item.sellPrice ?? '';
    document.getElementById('item-rating').value = item.rating ?? '';
    document.getElementById('pass-date-container').classList.toggle('hidden', item.status !== 'passed');
    document.getElementById('delete-btn').classList.remove('hidden');

    closeModal(listModal);
    openModal(itemModal);
};
