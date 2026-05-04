import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { functions, db } from '../config/firebase.js';

/**
 * Trigger a Steam data sync via Cloud Function.
 * @returns {{ matched?: number, updated?: number, unmatched?: Array, error?: string }}
 */
export const triggerSteamSync = async () => {
    try {
        const fn = httpsCallable(functions, 'syncSteamData');
        const result = await fn();
        if (result.data.error) return { error: result.data.error };
        return result.data;
    } catch (error) {
        let msg = 'Steam同步失败。';
        if (error.code === 'unavailable') msg = '无法连接到服务器。';
        else if (error.message) msg = `Steam同步失败: ${error.message}`;
        return { error: msg };
    }
};

/**
 * Listen to Steam sync metadata changes in Firestore.
 * @param {(data: object|null) => void} onUpdate
 * @returns {() => void} unsubscribe function
 */
export const setupSteamSyncMetadataListener = (onUpdate) => {
    const ref = doc(db, 'metadata', 'steamSync');
    return onSnapshot(ref, (snap) => {
        onUpdate(snap.exists() ? snap.data() : null);
    }, (error) => {
        console.error('Error fetching Steam sync metadata:', error);
        onUpdate(null);
    });
};
