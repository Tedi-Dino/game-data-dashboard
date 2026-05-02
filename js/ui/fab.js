import { openModal } from './modals.js';
import { setIsEditingFromList } from '../core/state.js';
import { setFormMode } from './item-form.js';

/**
 * Setup the floating action button (FAB) behavior.
 */
export const setupFab = () => {
    const fabContainer = document.querySelector('.fab-container');
    const addItemFab = document.getElementById('add-item-fab');
    const itemModal = document.getElementById('item-modal');
    const modalTitle = document.getElementById('modal-title');
    const itemForm = document.getElementById('item-form');
    const itemId = document.getElementById('item-id');
    const itemCustomId = document.getElementById('item-custom-id');
    const deleteBtn = document.getElementById('delete-btn');
    const purchaseDate = document.getElementById('purchase-date');
    const itemStatus = document.getElementById('item-status');
    const passDateContainer = document.getElementById('pass-date-container');

    if (!addItemFab) return;

    addItemFab.addEventListener('click', () => {
        if (fabContainer.classList.contains('open')) {
            setIsEditingFromList(false);
            modalTitle.textContent = '添加记录';
            itemForm.reset();
            itemId.value = '';
            itemCustomId.value = '';
            deleteBtn.classList.add('hidden');
            purchaseDate.value = new Date().toISOString().split('T')[0];
            itemStatus.value = 'empty';
            passDateContainer.classList.add('hidden');
            setFormMode('game');
            openModal(itemModal);
            fabContainer.classList.remove('open');
        } else {
            fabContainer.classList.add('open');
        }
    });

    // Close FAB when clicking outside
    document.addEventListener('click', (e) => {
        if (!fabContainer.contains(e.target) && fabContainer.classList.contains('open')) {
            fabContainer.classList.remove('open');
        }
    });
};
