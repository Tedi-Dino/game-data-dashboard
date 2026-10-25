import { setIsEditingFromList, isEditingFromList } from '../core/state.js';
import { parseFloatOrNull, parseDateOrNull } from '../core/utils.js';
import { saveItem, deleteItem as deleteFirestoreItem, updateLastModifiedTimestamp } from '../services/firestore.js';
import { closeModal, openModal, showConfirmation, showAlert } from './modals.js';
import { renderItemsList, updateSortHeaders } from './data-table.js';

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

const ACTIVE_MODE_CLASS = 'bg-amber-600 text-white';
const INACTIVE_MODE_CLASS = 'text-stone-600 hover:bg-stone-200';
const BASE_MODE_CLASS = 'mode-btn flex-1 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer';

// Values typed in game mode are restored when the user toggles to 剧集 and back.
// Cleared whenever a fresh add/edit form is opened.
let gameSnapshot = null;
export const resetFormModeMemory = () => { gameSnapshot = null; };

export const setFormMode = (mode) => {
    const formMode = document.getElementById('form-mode');
    const modeGameBtn = document.getElementById('mode-game-btn');
    const modeDramaBtn = document.getElementById('mode-drama-btn');
    const gameFields = document.getElementById('game-fields');
    const dramaFields = document.getElementById('drama-fields');
    const fromPriceRow = document.getElementById('from-price-row');
    const resellFields = document.getElementById('resell-fields');
    const itemFrom = document.getElementById('item-from');
    const purchasePrice = document.getElementById('purchase-price');

    const previousMode = formMode?.value || 'game';
    const isDrama = mode === 'drama';

    // Capture before switching so the fields are not overwritten by drama defaults.
    if (isDrama && previousMode !== 'drama') {
        gameSnapshot = {
            from: itemFrom?.value,
            purchasePrice: purchasePrice?.value,
            remarks: document.getElementById('item-remarks')?.value,
        };
    }

    if (formMode) formMode.value = mode;

    if (modeGameBtn) {
        modeGameBtn.className = `${BASE_MODE_CLASS} ${isDrama ? INACTIVE_MODE_CLASS : ACTIVE_MODE_CLASS}`;
        modeGameBtn.setAttribute('aria-pressed', String(!isDrama));
    }
    if (modeDramaBtn) {
        modeDramaBtn.className = `${BASE_MODE_CLASS} ${isDrama ? ACTIVE_MODE_CLASS : INACTIVE_MODE_CLASS}`;
        modeDramaBtn.setAttribute('aria-pressed', String(isDrama));
    }
    if (gameFields) gameFields.classList.toggle('hidden', isDrama);
    if (dramaFields) dramaFields.classList.toggle('hidden', !isDrama);
    if (fromPriceRow) fromPriceRow.classList.toggle('hidden', isDrama);
    if (resellFields) resellFields.classList.toggle('hidden', isDrama);

    if (isDrama) {
        if (itemFrom) itemFrom.value = 'free';
        if (purchasePrice) purchasePrice.value = '0';
        const itemRemarks = document.getElementById('item-remarks');
        if (itemRemarks) itemRemarks.value = '';
        // Keep the auto-calculated readout in sync with whatever episode numbers
        // are currently in the drama fields (they survive form-mode toggles).
        const count = parseFloat(document.getElementById('episode-count')?.value);
        const duration = parseFloat(document.getElementById('episode-duration')?.value);
        const calculated = document.getElementById('calculated-time');
        if (calculated) {
            calculated.textContent = count > 0 && duration > 0
                ? `${(count * duration / 60).toFixed(2)} 小时`
                : '-';
        }
    } else {
        // Restore what the user had typed instead of leaving 免费/0 behind.
        if (gameSnapshot) {
            if (itemFrom && gameSnapshot.from != null) itemFrom.value = gameSnapshot.from;
            if (purchasePrice && gameSnapshot.purchasePrice != null) purchasePrice.value = gameSnapshot.purchasePrice;
            const itemRemarks = document.getElementById('item-remarks');
            if (itemRemarks && gameSnapshot.remarks != null) itemRemarks.value = gameSnapshot.remarks;
            gameSnapshot = null;
        }
        const dramaTypeSelect = document.getElementById('drama-type');
        if (dramaTypeSelect) dramaTypeSelect.value = '';
    }
};

/**
 * Toggle Steam fields visibility based on platform type selection.
 */
export const updateSteamFieldsVisibility = () => {
    const itemType = document.getElementById('item-type');
    const steamFields = document.getElementById('steam-fields');
    if (steamFields && itemType) {
        steamFields.classList.toggle('hidden', itemType.value !== 'steam');
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

    const data = {
        id: document.getElementById('item-custom-id').value.trim(),
        name: document.getElementById('item-name').value,
        sort: document.getElementById('item-sort').value,
        type,
        from: isDrama ? 'free' : document.getElementById('item-from').value,
        purchaseDate: parseDateOrNull(document.getElementById('purchase-date').value),
        startDate: parseDateOrNull(document.getElementById('start-date').value),
        purchasePrice: isDrama ? 0 : parseFloatOrNull(document.getElementById('purchase-price').value),
        playTime,
        status,
        passDate: status === 'passed' ? parseDateOrNull(document.getElementById(passDateId).value) : null,
        sellDate: isDrama ? null : parseDateOrNull(document.getElementById('sell-date').value),
        sellPrice: isDrama ? null : parseFloatOrNull(document.getElementById('sell-price').value),
        rating: (() => { const r = parseFloatOrNull(document.getElementById(ratingId).value); return r != null ? Math.min(10, Math.max(1, r)) : null; })(),
        episodeCount,
        episodeDuration,
        remarks: document.getElementById('item-remarks').value.trim() || null
    };

    // Steam-specific fields
    if (type === 'steam') {
        const appIdVal = parseFloatOrNull(document.getElementById('steam-app-id').value);
        data.steam_app_id = appIdVal != null ? Math.round(appIdVal) : null;
        data.steam_override = document.getElementById('steam-override').checked;
    } else {
        // saveItem uses {merge: true}, so simply omitting these would LEAVE the old
        // binding behind after a platform change. Write null explicitly so the daily
        // Steam sync stops overwriting this item's manually entered playTime.
        data.steam_app_id = null;
        data.steam_override = null;
    }

    // Achievement completion (all game platforms). Drama rows never carry it:
    // the hidden game checkbox would otherwise keep a stale true value.
    const fullyCompletedCheckbox = document.getElementById('fully-completed');
    data.fullyCompleted = !isDrama && Boolean(fullyCompletedCheckbox?.checked);

    return data;
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
                showAlert('保存失败，请检查网络连接后重试。');
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
                    showAlert('删除失败，请检查网络连接后重试。');
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

    // --- Drama type dropdown → sync to sort field ---
    const dramaTypeSelect = document.getElementById('drama-type');
    const itemSort = document.getElementById('item-sort');
    if (dramaTypeSelect && itemSort) {
        dramaTypeSelect.addEventListener('change', () => {
            if (dramaTypeSelect.value) itemSort.value = dramaTypeSelect.value;
        });
    }

    // --- Platform type change: toggle Steam fields + auto-generate ID ---
    const itemType = document.getElementById('item-type');

    if (itemType) {
        itemType.addEventListener('change', () => {
            updateSteamFieldsVisibility();
            if (!itemIdEl.value && !itemCustomId.value) {
                itemCustomId.value = `${itemType.value.charAt(0)}-${crypto.randomUUID().slice(0, 8)}`;
            }
        });
        // Set initial visibility based on default type
        updateSteamFieldsVisibility();
    }
};
