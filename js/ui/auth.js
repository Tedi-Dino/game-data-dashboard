import { auth } from '../config/firebase.js';
import { ADMIN_UIDS } from '../config/constants.js';

let userId = null;

export const getUserId = () => userId;

export const setUserId = (id) => { userId = id; };

export const isAdmin = () => userId && ADMIN_UIDS.includes(userId);

/**
 * Update UI elements to reflect read-only vs write access.
 * @param {string|null} currentUserId
 */
export const updateUIAccess = () => {
    const isReadOnly = !isAdmin();
    const fabContainer = document.querySelector('.fab-container');
    const tableBody = document.getElementById('items-table-body');

    const writeButtons = [
        document.getElementById('add-item-fab'),
        document.getElementById('import-btn'),
        document.getElementById('delete-btn'),
        document.getElementById('save-btn')
    ];

    if (isReadOnly) {
        if (fabContainer) fabContainer.classList.add('hidden');
        writeButtons.forEach(btn => {
            if (btn) {
                btn.classList.add('readonly-mode-disabled');
                btn.title = '需要管理员权限';
            }
        });
        if (tableBody) tableBody.style.pointerEvents = 'none';
    } else {
        if (fabContainer) fabContainer.classList.remove('hidden');
        writeButtons.forEach(btn => {
            if (btn) {
                btn.classList.remove('readonly-mode-disabled');
                btn.title = '';
            }
        });
        if (tableBody) tableBody.style.pointerEvents = 'auto';
    }
};

/**
 * Update avatar and login/logout button visibility.
 */
export const updateAuthUI = (user) => {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');

    if (user) {
        setUserId(user.uid);
        if (userAvatar) {
            userAvatar.src = user.photoURL ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'A')}&background=random`;
        }
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userInfo) {
            userInfo.classList.remove('hidden');
            userInfo.classList.add('flex');
        }
    } else {
        setUserId(null);
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userInfo) {
            userInfo.classList.add('hidden');
            userInfo.classList.remove('flex');
        }
    }
    updateUIAccess();
};
