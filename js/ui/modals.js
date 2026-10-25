// Focus origin per modal. A single global slot broke nested dialogs: opening
// the delete confirmation over the edit form overwrote the form's opener, so
// closing both could leave focus on a hidden button.
const lastFocusedByModal = new WeakMap();

// Import escapeHTML for safe HTML rendering
import { escapeHTML } from '../core/utils.js';

// --- Modal close hooks -------------------------------------------------------
// Persistent hooks run every time a modal closes (e.g. tearing down a chart).
// Dialog promises use the same mechanism as a one-shot hook so Escape/backdrop
// can no longer leave a `showConfirmation()` promise pending forever.
const closeHandlers = new WeakMap();

export const onModalClose = (modal, handler) => {
    if (!modal || typeof handler !== 'function') return () => {};
    let handlers = closeHandlers.get(modal);
    if (!handlers) {
        handlers = new Set();
        closeHandlers.set(modal, handlers);
    }
    handlers.add(handler);
    return () => handlers.delete(handler);
};

const runCloseHandlers = (modal) => {
    const handlers = closeHandlers.get(modal);
    if (!handlers) return;
    // Copy first: a handler may unregister itself while running.
    [...handlers].forEach(handler => {
        try {
            handler();
        } catch (error) {
            console.error('Modal close handler failed:', error);
        }
    });
};

const syncBodyScrollLock = () => {
    const openCount = document.querySelectorAll('[aria-modal="true"]:not(.hidden)').length;
    document.body.classList.toggle('modal-open', openCount > 0);
};

// Only visible, enabled elements may take focus. `offsetParent` is null for
// display:none nodes, which is exactly what hidden form rows need.
const getFocusable = (modal) => {
    if (!modal) return [];
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(modal.querySelectorAll(selector)).filter(el => {
        if (el.disabled) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (typeof el.getClientRects === 'function') return el.getClientRects().length > 0;
        return el.offsetParent !== null;
    });
};

/**
 * Open a modal by removing 'hidden' and adding 'flex' classes.
 */
export const openModal = (modal) => {
    if (!modal) return;
    const wasOpen = !modal.classList.contains('hidden');
    if (!wasOpen) {
        const opener = document.activeElement;
        // Only remember an opener that is actually outside this dialog.
        if (opener && opener !== document.body && !modal.contains(opener)) {
            lastFocusedByModal.set(modal, opener);
        }
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    syncBodyScrollLock();

    requestAnimationFrame(() => {
        const preferred = modal.querySelector('[data-autofocus]:not([disabled])');
        const focusable = getFocusable(modal);
        const target = (preferred && focusable.includes(preferred)) ? preferred : focusable[0];
        if (target) target.focus();
    });
};

/**
 * Close a modal by adding 'hidden' and removing 'flex' classes.
 */
export const closeModal = (modal) => {
    if (!modal) return;
    const wasOpen = !modal.classList.contains('hidden');
    const opener = lastFocusedByModal.get(modal);
    lastFocusedByModal.delete(modal);
    if (wasOpen) runCloseHandlers(modal);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    syncBodyScrollLock();

    // Restore focus to this dialog's own opener. Rows can be re-rendered while
    // an edit modal is open, so a detached node must not become the target.
    if (wasOpen && opener && opener.isConnected !== false
        && typeof opener.focus === 'function') {
        opener.focus();
    }
};

// z-index of a modal, defaulting to 0 when unset.
const zIndexOf = (el) => {
    const z = Number.parseInt(getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
};

// Topmost open modal. Picks the highest z-index rather than the last element in
// DOM order — those disagree (confirm-modal sits earlier but stacks above
// play-next-modal), which made Esc close the wrong dialog.
const getTopModal = () => {
    const openModals = Array.from(document.querySelectorAll('[aria-modal="true"]:not(.hidden)'));
    if (openModals.length === 0) return null;
    return openModals.reduce((top, el) => (zIndexOf(el) >= zIndexOf(top) ? el : top));
};

// Global Escape key handler — closes the topmost open modal.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const topModal = getTopModal();
    if (topModal) closeModal(topModal);
});

// Focus trap: keep Tab/Shift+Tab within the topmost open modal.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const modal = getTopModal();
    if (!modal) return;
    const focusable = getFocusable(modal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!modal.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
    }
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

// --- Long-lived dialog state --------------------------------------------------
// The confirm modal is a single DOM node shared by alerts and confirmations.
// Settling the previous promise before reusing it avoids a stuck promise when
// two dialogs overlap (e.g. an error alert while a delete confirmation is open).
let activeDialogSettler = null;

const settleActiveDialog = () => {
    const settle = activeDialogSettler;
    activeDialogSettler = null;
    if (settle) settle();
};

const wireDialog = (modal, onBackdrop) => {
    const handleBackdrop = (e) => {
        if (e.target === modal) {
            if (onBackdrop) onBackdrop();
            else closeModal(modal);
        }
    };
    modal.addEventListener('click', handleBackdrop);
    return () => modal.removeEventListener('click', handleBackdrop);
};

/**
 * Show an alert dialog (OK only, no cancel).
 * Returns a Promise that resolves when dismissed, including via Escape/backdrop.
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

        settleActiveDialog();
        if (titleEl) titleEl.textContent = '提示';
        if (cancelBtn) cancelBtn.classList.add('hidden');
        messageEl.textContent = String(message || '');

        // Clone so listeners from an earlier confirmation cannot fire again.
        const newOkBtn = okBtn.cloneNode(true);
        newOkBtn.classList.remove('hidden', 'btn-danger');
        newOkBtn.classList.add('btn', 'btn-primary');
        newOkBtn.textContent = '知道了';
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        let settled = false;
        const offClose = onModalClose(modal, () => settle());
        const offBackdrop = wireDialog(modal, () => closeModal(modal));

        const settle = () => {
            if (settled) return;
            settled = true;
            offClose();
            offBackdrop();
            activeDialogSettler = null;
            resolve();
        };
        activeDialogSettler = settle;

        newOkBtn.addEventListener('click', () => closeModal(modal));
        openModal(modal);
    });
};

/**
 * Show a confirmation dialog.
 * Returns a Promise resolving true (confirmed) or false (cancelled / dismissed).
 * Escape and backdrop clicks cancel; they never leave the caller hanging.
 */
export const showConfirmation = (message, asHtml = false) => {
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

        settleActiveDialog();
        if (titleEl) titleEl.textContent = '请确认';
        cancelBtn.classList.remove('hidden');
        if (asHtml) {
            messageEl.innerHTML = escapeHTML(message).replace(/\n/g, '<br>');
        } else {
            messageEl.textContent = String(message || '');
        }

        const newOkBtn = okBtn.cloneNode(true);
        newOkBtn.classList.remove('hidden', 'btn-primary');
        newOkBtn.classList.add('btn', 'btn-danger');
        newOkBtn.textContent = '确认';
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        const newCancelBtn = cancelBtn.cloneNode(true);
        newCancelBtn.classList.remove('hidden');
        newCancelBtn.classList.add('btn', 'btn-secondary');
        newCancelBtn.textContent = '取消';
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        let settled = false;
        const settle = (result) => {
            if (settled) return;
            settled = true;
            offClose();
            offBackdrop();
            activeDialogSettler = null;
            resolve(result);
        };

        const offClose = onModalClose(modal, () => settle(false));
        const offBackdrop = wireDialog(modal, () => closeModal(modal));
        activeDialogSettler = () => settle(false);

        newOkBtn.addEventListener('click', () => {
            // Settle as confirmed *before* closeModal(): closeModal runs the
            // close hook, which would otherwise settle false and turn every
            // confirmation (delete/import) into a cancellation.
            settle(true);
            closeModal(modal);
        });
        newCancelBtn.addEventListener('click', () => closeModal(modal));
        openModal(modal);
    });
};

/**
 * Lightweight non-blocking notification. The live region in index.html is
 * aria-live="polite"; the toast itself never steals focus.
 */
export const showToast = (message, { tone = 'info', timeout = 3400 } = {}) => {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;

    const icon = document.createElement('i');
    icon.className = tone === 'error'
        ? 'fas fa-circle-exclamation'
        : (tone === 'success' ? 'fas fa-circle-check' : 'fas fa-circle-info');
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = String(message || '');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', '关闭提示');
    close.textContent = '×';

    toast.append(icon, text, close);
    region.appendChild(toast);
    while (region.children.length > 4) region.firstElementChild.remove();

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 180);
    };
    close.addEventListener('click', dismiss);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    if (timeout > 0) setTimeout(dismiss, timeout);
    return dismiss;
};
