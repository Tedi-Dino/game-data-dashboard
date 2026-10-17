import { auth } from '../config/firebase.js';
import { ADMIN_UIDS, PLATFORM_COLORS, FEATURES } from '../config/constants.js';

// Build the avatar locally instead of calling ui-avatars.com: that third-party
// request leaked the display name in its query string, added a first-paint
// dependency, and broke the image whenever the service was unreachable.
const localAvatarDataUrl = (name, seed) => {
    const initials = (name || '?').trim().charAt(0).toUpperCase() || '?';
    const palette = Object.values(PLATFORM_COLORS);
    const hue = palette[Math.abs(hash(String(seed || name))) % palette.length];
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">` +
        `<rect width="80" height="80" rx="40" fill="${hue}"/>` +
        `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#ffffff" ` +
        `font-family="system-ui, sans-serif" font-size="36" font-weight="600">${initials}</text>` +
        `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// djb2 — same helper shape as utils.js (kept local to avoid a circular import).
const hash = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
};

const getUserId = () => userId;

const setUserId = (id) => { userId = id; };

export const isAdmin = () => userId && ADMIN_UIDS.includes(userId);

// Set both `disabled` (blocks mouse AND keyboard activation) and the visual class.
// The class alone relied on `pointer-events: none`, which did not stop Tab+Enter.
const setReadOnlyState = (btn, readOnly) => {
    if (!btn) return;
    if (readOnly) {
        btn.classList.add('readonly-mode-disabled');
        btn.title = '需要管理员权限';
        // Native <button> support real disabling; div-based controls get aria only.
        if (typeof btn.disabled === 'boolean') btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
    } else {
        btn.classList.remove('readonly-mode-disabled');
        btn.title = '';
        if (typeof btn.disabled === 'boolean') btn.disabled = false;
        btn.removeAttribute('aria-disabled');
    }
};

/**
 * Update UI elements to reflect read-only vs write access.
 */
const updateUIAccess = () => {
    const isReadOnly = !isAdmin();
    const fabContainer = document.querySelector('.fab-container');
    const tableBody = document.getElementById('items-table-body');

    const writeButtons = [
        document.getElementById('add-item-fab'),
        document.getElementById('import-btn'),
        document.getElementById('delete-btn'),
        document.getElementById('save-btn')
    ];

    const steamSyncBtn = document.getElementById('steam-sync-btn');

    if (isReadOnly) {
        if (fabContainer) fabContainer.classList.add('hidden');
        writeButtons.forEach(btn => setReadOnlyState(btn, true));
        // Do NOT disable pointer events on the table: that also blocked text
        // selection and copying. Row clicks are already gated by isAdmin() in
        // handleEditItem(), so this is safe.
        if (tableBody) tableBody.classList.add('readonly-table');
        if (steamSyncBtn) {
            steamSyncBtn.classList.add('hidden');
            steamSyncBtn.classList.remove('flex');
        }
    } else {
        if (fabContainer) fabContainer.classList.remove('hidden');
        writeButtons.forEach(btn => setReadOnlyState(btn, false));
        if (tableBody) tableBody.classList.remove('readonly-table');
        // Only surface the sync button when the Cloud Function path exists.
        if (steamSyncBtn && FEATURES.STEAM_SYNC) {
            steamSyncBtn.classList.remove('hidden');
            steamSyncBtn.classList.add('flex');
        }
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
            if (user.photoURL) {
                userAvatar.src = user.photoURL;
            } else {
                userAvatar.src = localAvatarDataUrl(user.displayName, user.uid);
            }
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
