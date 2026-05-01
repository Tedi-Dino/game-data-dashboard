/**
 * Open a modal by removing 'hidden' and adding 'flex' classes.
 */
export const openModal = (modal) => {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

/**
 * Close a modal by adding 'hidden' and removing 'flex' classes.
 */
export const closeModal = (modal) => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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
