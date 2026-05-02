import { setIsEditingFromList, isEditingFromList } from '../core/state.js';
import { parseFloatOrNull, parseDateOrNull } from '../core/utils.js';
import { saveItem, deleteItem as deleteFirestoreItem, updateLastModifiedTimestamp } from '../services/firestore.js';
import { closeModal, showConfirmation } from './modals.js';
import { renderItemsList, updateSortHeaders } from './data-table.js';
import { openModal } from './modals.js';

/**
 * Close the item modal. If we came from the list modal, re-render it.
 */
const closeItemModalAndReturnToList = () => {
    closeModal(document.getElementById('item-modal'));
    if (isEditingFromList) {
        renderItemsList();
        updateSortHeaders();
        openModal(document.getElementById('list-modal'));
    }
    setIsEditingFromList(false);
};

/**
 * Switch between game and drama mode in the form.
 */
export const setFormMode = (mode) => {
    const formMode = document.getElementById('form-mode');
    const modeGameBtn = document.getElementById('mode-game-btn');
    const modeDramaBtn = document.getElementById('mode-drama-btn');
    const gameFields = document.getElementById('game-fields');
    const dramaFields = document.getElementById('drama-fields');
    const fromPriceRow = document.getElementById('from-price-row');
    const itemFrom = document.getElementById('item-from');
    const purchasePrice = document.getElementById('purchase-price');

    if (formMode) formMode.value = mode;

    if (mode === 'drama') {
        if (modeGameBtn) {
            modeGameBtn.className = 'flex-1 px-3 py-1.5 font-medium rounded-md text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer';
        }
        if (modeDramaBtn) {
            modeDramaBtn.className = 'flex-1 px-3 py-1.5 font-medium rounded-md bg-amber-600 text-white transition-colors cursor-pointer';
        }
        if (gameFields) gameFields.classList.add('hidden');
        if (dramaFields) dramaFields.classList.remove('hidden');
        if (fromPriceRow) fromPriceRow.classList.add('hidden');
        if (itemFrom) itemFrom.value = 'free';
        if (purchasePrice) purchasePrice.value = '0';
    } else {
        if (modeGameBtn) {
            modeGameBtn.className = 'flex-1 px-3 py-1.5 font-medium rounded-md bg-amber-600 text-white transition-colors cursor-pointer';
        }
        if (modeDramaBtn) {
            modeDramaBtn.className = 'flex-1 px-3 py-1.5 font-medium rounded-md text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer';
        }
        if (gameFields) gameFields.classList.remove('hidden');
        if (dramaFields) dramaFields.classList.add('hidden');
        if (fromPriceRow) fromPriceRow.classList.remove('hidden');
    }
};

/**
 * Read all form field values and return an item data object.
 */
const readFormData = () => {
    const mode = document.getElementById('form-mode')?.value || 'game';
    const isDrama = mode === 'drama';

    const status = isDrama
        ? document.getElementById('item-status-drama').value
        : document.getElementById('item-status').value;

    const type = isDrama ? 'drama' : document.getElementById('item-type').value;

    let playTime = parseFloatOrNull(document.getElementById('play-time').value);
    let episodeCount = null;
    let episodeDuration = null;

    if (isDrama) {
        episodeCount = parseFloatOrNull(document.getElementById('episode-count').value);
        episodeDuration = parseFloatOrNull(document.getElementById('episode-duration').value);
        if (episodeCount != null && episodeDuration != null) {
            playTime = parseFloat((episodeCount * episodeDuration / 60).toFixed(2));
        }
    }

    const passDateId = isDrama ? 'pass-date-drama' : 'pass-date';
    const ratingId = isDrama ? 'item-rating-drama' : 'item-rating';

    return {
        id: document.getElementById('item-custom-id').value,
        name: document.getElementById('item-name').value,
        sort: document.getElementById('item-sort').value,
        type,
        from: isDrama ? 'free' : document.getElementById('item-from').value,
        purchaseDate: parseDateOrNull(document.getElementById('purchase-date').value),
        purchasePrice: isDrama ? 0 : parseFloatOrNull(document.getElementById('purchase-price').value),
        playTime,
        status,
        passDate: status === 'passed' ? parseDateOrNull(document.getElementById(passDateId).value) : null,
        sellDate: isDrama ? null : parseDateOrNull(document.getElementById('sell-date').value),
        sellPrice: isDrama ? null : parseFloatOrNull(document.getElementById('sell-price').value),
        rating: parseFloatOrNull(document.getElementById(ratingId).value),
        episodeCount,
        episodeDuration
    };
};

/**
 * Setup the item add/edit form, delete button, and related type/status change handlers.
 */
export const setupItemForm = () => {
    const itemForm = document.getElementById('item-form');
    const deleteBtn = document.getElementById('delete-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn');
    const itemStatus = document.getElementById('item-status');
    const itemStatusDrama = document.getElementById('item-status-drama');
    const itemIdEl = document.getElementById('item-id');
    const itemCustomId = document.getElementById('item-custom-id');
    const passDateContainer = document.getElementById('pass-date-container');
    const passDateContainerDrama = document.getElementById('pass-date-container-drama');

    // --- Mode Toggle ---
    const modeGameBtn = document.getElementById('mode-game-btn');
    const modeDramaBtn = document.getElementById('mode-drama-btn');
    if (modeGameBtn) {
        modeGameBtn.addEventListener('click', () => setFormMode('game'));
    }
    if (modeDramaBtn) {
        modeDramaBtn.addEventListener('click', () => setFormMode('drama'));
    }

    // --- Form Submit ---
    if (itemForm && saveBtn) {
        itemForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fbId = itemIdEl.value;
            const itemData = readFormData();

            // Prevent double submit
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';

            try {
                await saveItem(fbId, itemData);
                await updateLastModifiedTimestamp();
                closeItemModalAndReturnToList();
            } catch (error) {
                console.error('Error saving item:', error);
                showConfirmation('保存失败，请检查网络连接后重试。').then(() => {});
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = '保存';
            }
        });
    }

    // --- Delete Button ---
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showConfirmation('您确定要删除此记录吗？此操作无法撤销。').then(async (confirmed) => {
                if (!confirmed) return;
                try {
                    await deleteFirestoreItem(itemIdEl.value);
                    await updateLastModifiedTimestamp();
                    closeItemModalAndReturnToList();
                } catch (error) {
                    console.error('Error deleting item:', error);
                    showConfirmation('删除失败，请检查网络连接后重试。').then(() => {});
                }
            });
        });
    }

    // --- Close / Cancel ---
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeItemModalAndReturnToList);
    if (cancelBtn) cancelBtn.addEventListener('click', closeItemModalAndReturnToList);

    // --- Status change → toggle pass date (game) ---
    if (itemStatus && passDateContainer) {
        itemStatus.addEventListener('change', (e) => {
            passDateContainer.classList.toggle('hidden', e.target.value !== 'passed');
        });
    }

    // --- Status change → toggle pass date (drama) ---
    if (itemStatusDrama && passDateContainerDrama) {
        itemStatusDrama.addEventListener('change', (e) => {
            passDateContainerDrama.classList.toggle('hidden', e.target.value !== 'passed');
        });
    }

    // --- Drama episode auto-calc ---
    const episodeCountInput = document.getElementById('episode-count');
    const episodeDurationInput = document.getElementById('episode-duration');
    const calculatedTime = document.getElementById('calculated-time');

    const updateDramaPlayTime = () => {
        const count = parseFloat(episodeCountInput?.value);
        const duration = parseFloat(episodeDurationInput?.value);
        if (count > 0 && duration > 0) {
            const hours = (count * duration / 60).toFixed(2);
            if (calculatedTime) calculatedTime.textContent = `${hours} 小时`;
        } else {
            if (calculatedTime) calculatedTime.textContent = '-';
        }
    };

    if (episodeCountInput) episodeCountInput.addEventListener('input', updateDramaPlayTime);
    if (episodeDurationInput) episodeDurationInput.addEventListener('input', updateDramaPlayTime);

    // --- Auto-generate ID for new items ---
    if (itemCustomId) {
        const itemType = document.getElementById('item-type');
        if (itemType) {
            itemType.addEventListener('change', () => {
                if (!itemIdEl.value && !itemCustomId.value) {
                    itemCustomId.value = `${itemType.value.charAt(0)}-${crypto.randomUUID().slice(0, 8)}`;
                }
            });
        }
    }
};
