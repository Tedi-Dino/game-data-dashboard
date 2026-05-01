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
 * Read all form field values and return an item data object.
 */
const readFormData = () => {
    const status = document.getElementById('item-status').value;
    return {
        id: document.getElementById('item-custom-id').value,
        name: document.getElementById('item-name').value,
        sort: document.getElementById('item-sort').value,
        type: document.getElementById('item-type').value,
        from: document.getElementById('item-from').value,
        purchaseDate: parseDateOrNull(document.getElementById('purchase-date').value),
        purchasePrice: parseFloatOrNull(document.getElementById('purchase-price').value),
        playTime: parseFloatOrNull(document.getElementById('play-time').value),
        status,
        passDate: status === 'passed' ? parseDateOrNull(document.getElementById('pass-date').value) : null,
        sellDate: parseDateOrNull(document.getElementById('sell-date').value),
        sellPrice: parseFloatOrNull(document.getElementById('sell-price').value),
        rating: parseFloatOrNull(document.getElementById('item-rating').value)
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
    const itemType = document.getElementById('item-type');
    const itemStatus = document.getElementById('item-status');
    const itemIdEl = document.getElementById('item-id');
    const itemCustomId = document.getElementById('item-custom-id');
    const passDateContainer = document.getElementById('pass-date-container');

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

    // --- Status change → toggle pass date ---
    if (itemStatus && passDateContainer) {
        itemStatus.addEventListener('change', (e) => {
            passDateContainer.classList.toggle('hidden', e.target.value !== 'passed');
        });
    }

    // --- Type change → auto-generate ID ---
    if (itemType && itemCustomId) {
        itemType.addEventListener('change', () => {
            if (!itemIdEl.value && !itemCustomId.value) {
                itemCustomId.value = `${itemType.value.charAt(0)}-${Date.now().toString().slice(-8)}`;
            }
        });
    }
};
