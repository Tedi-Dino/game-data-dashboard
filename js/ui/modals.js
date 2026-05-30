let lastFocusedEl = null;

// Import escapeHTML for safe HTML rendering
import { escapeHTML } from '../core/utils.js';

/**
 * Open a modal by removing 'hidden' and adding 'flex' classes.
 */
export const openModal = (modal) => {
    if (!modal) return;
    lastFocusedEl = document.activeElement;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    // Focus the first focusable element inside the modal
    requestAnimationFrame(() => {
        const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
    });
};

/**
 * Close a modal by adding 'hidden' and removing 'flex' classes.
 */
export const closeModal = (modal) => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    // Restore focus to element that was focused before the modal opened
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
        lastFocusedEl.focus();
        lastFocusedEl = null;
    }
};

// Global Escape key handler — closes the topmost open modal
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModals = Array.from(document.querySelectorAll('[aria-modal="true"]:not(.hidden)'));
    if (openModals.length === 0) return;
    const topModal = openModals[openModals.length - 1];
    closeModal(topModal);
});

// Focus trap: keep Tab/Shift+Tab within the topmost open modal
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const openModals = Array.from(document.querySelectorAll('[aria-modal="true"]:not(.hidden)'));
    if (openModals.length === 0) return;
    const modal = openModals[openModals.length - 1];
    const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

/**
 * Show an alert dialog (OK only, no cancel).
 * Returns a Promise that resolves when dismissed.
 */
export const showAlert = (message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-modal-message');
        const titleEl = document.getElementById('confirm-modal-title');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!modal || !messageEl || !okBtn) {
            resolve();
            return;
        }

        if (titleEl) titleEl.textContent = '提示';
        okBtn.classList.remove('hidden');
        if (cancelBtn) cancelBtn.classList.add('hidden');
        messageEl.textContent = '';
        messageEl.innerHTML = escapeHTML(message).replace(/\n/g, '<br>');

        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        let settled = false;
        const handleConfirm = () => {
            if (settled) return;
            settled = true;
            closeModal(modal);
            newOkBtn.removeEventListener('click', handleConfirm);
            modal.removeEventListener('click', handleBackdrop);
            if (cancelBtn) cancelBtn.classList.remove('hidden');
            resolve();
        };
        const handleBackdrop = (e) => { if (e.target === modal) handleConfirm(); };

        newOkBtn.addEventListener('click', handleConfirm);
        modal.addEventListener('click', handleBackdrop);
        openModal(modal);
    });
};

/**
 * Show a confirmation dialog.
 * Returns a Promise that resolves with true (confirmed) or false (cancelled).
 * Supports nested calls — each call gets its own fresh listeners.
 */
export const showConfirmation = (message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-modal-message');
        const titleEl = document.getElementById('confirm-modal-title');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!modal || !messageEl || !okBtn || !cancelBtn) {
            resolve(false);
            return;
        }

        // Reset title in case previous call changed it
        if (titleEl) titleEl.textContent = '请确认';
        // Ensure OK button is visible (previous calls may have hidden it)
        okBtn.classList.remove('hidden');
        messageEl.textContent = message;

        // Clone and replace OK button to clear old listeners
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        // Clone and replace Cancel button too (so main.js's permanent listener doesn't stack)
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        let settled = false;

        const handleConfirm = () => {
            if (settled) return;
            settled = true;
            closeModal(modal);
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            if (settled) return;
            settled = true;
            closeModal(modal);
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            newOkBtn.removeEventListener('click', handleConfirm);
            newCancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
        };

        // Close on backdrop click
        const handleBackdrop = (e) => {
            if (e.target === modal) handleCancel();
        };

        newOkBtn.addEventListener('click', handleConfirm);
        newCancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);

        openModal(modal);
    });
};
