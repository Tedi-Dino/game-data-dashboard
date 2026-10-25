import { openModal } from './modals.js';
import { setIsEditingFromList } from '../core/state.js';
import { setFormMode, updateSteamFieldsVisibility, resetFormModeMemory } from './item-form.js';
import { isAdmin } from './auth.js';
import { todayLocalISODate } from '../core/utils.js';

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

    if (!addItemFab || !itemModal) return;

    const setFabOpen = (open) => {
        if (!fabContainer) return;
        fabContainer.classList.toggle('open', open);
        // The trigger is a real <button>, so expose the expanded state to AT.
        addItemFab.setAttribute('aria-expanded', String(open));
    };

    addItemFab.addEventListener('click', () => {
        if (!isAdmin()) return;

        if (fabContainer && fabContainer.classList.contains('open')) {
            setIsEditingFromList(false);
            if (modalTitle) modalTitle.textContent = '添加记录';
            itemForm?.reset();
            if (itemId) itemId.value = '';
            if (itemCustomId) itemCustomId.value = '';
            deleteBtn?.classList.add('hidden');
            // Local calendar date — `toISOString()` would return yesterday for any
            // moment before the timezone offset elapses (e.g. every morning < 08:00 CST).
            const today = todayLocalISODate();
            if (purchaseDate) purchaseDate.value = today;
            const startDate = document.getElementById('start-date');
            if (startDate) startDate.value = today;
            if (itemStatus) itemStatus.value = 'empty';
            passDateContainer?.classList.add('hidden');
            resetFormModeMemory();
            setFormMode('game');
            updateSteamFieldsVisibility();
            openModal(itemModal);
            setFabOpen(false);
        } else {
            setFabOpen(true);
        }
    });

    // Close FAB when clicking outside.
    document.addEventListener('click', (e) => {
        if (fabContainer && !fabContainer.contains(e.target) && fabContainer.classList.contains('open')) {
            setFabOpen(false);
        }
    });

    // Escape closes the speed-dial before it can reach a modal handler.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (fabContainer && fabContainer.classList.contains('open')) {
            setFabOpen(false);
            addItemFab.focus();
        }
    });
};
