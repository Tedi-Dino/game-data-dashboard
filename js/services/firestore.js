import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, query, writeBatch } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../config/firebase.js';
import { setItems } from '../core/state.js';
import { formatDateTime } from '../core/utils.js';
import { getCachedItems, setCachedItems, getCachedAt } from '../core/cache.js';
import { runBulkReplace } from './bulk-replace-core.js';

let itemsCollectionRef = null;
let unsubscribe = null;
let metadataUnsubscribe = null;

// Bulk import suppresses intermediate renders, but it must NOT drop the latest
// snapshot: the final event can arrive while the flag is set, and Firestore will
// not replay it afterwards. Keep it and apply it when the import finishes.
let importing = false;
let deferredSnapshot = null;

// Callback invoked whenever items update (set by main.js)
let onDataChange = null;

export const setOnDataChange = (fn) => { onDataChange = fn; };

// --- Load-status banner (B16) ---
// The metadata listener and the items listener both used to write #last-updated,
// so a failed items read could end up labelled as a fresh successful update.
// Errors now go to their own element and latch a flag metadata must respect.
const setBanner = (message, tone) => {
    const banner = document.getElementById('data-load-error');
    if (!banner) return;
    banner.textContent = message;
    banner.className = tone === 'warn' ? 'text-amber-600 font-medium' : 'text-red-600 font-medium';
    banner.classList.remove('hidden');
};

const clearBanner = () => {
    delete document.body.dataset.itemsLoadError;
    const banner = document.getElementById('data-load-error');
    if (!banner) return;
    banner.textContent = '';
    banner.classList.add('hidden');
};

// --- Firestore Items Listener ---
const applyItemsSnapshot = (snapshot) => {
    const items = snapshot.docs.map(doc => ({ fb_id: doc.id, ...doc.data() }));
    setItems(items);
    setCachedItems(items); // update cache
    clearBanner(); // live data arrived — drop any cached/failed banner
    if (onDataChange) { try { onDataChange(); } catch (e) { console.error('onDataChange error:', e); } }
};

export const setupFirestoreListener = async () => {
    if (unsubscribe) unsubscribe();
    if (!db) {
        console.error('Firestore db not initialized');
        return;
    }
    itemsCollectionRef = collection(db, 'items');

    // Try to load from cache first for instant render
    const cached = await getCachedItems();
    if (cached && cached.length > 0) {
        setItems(cached);
        const cachedAt = await getCachedAt();
        // Say so explicitly: the numbers are a snapshot, not live data.
        if (cachedAt) {
            setBanner(`正在显示本地缓存数据（${formatDateTime(cachedAt)}），尚未连接云端`, 'warn');
        }
        if (onDataChange) { try { onDataChange(); } catch (e) { console.error('onDataChange error (cache):', e); } }
    }

    // Then set up real-time Firestore listener
    unsubscribe = onSnapshot(itemsCollectionRef, (snapshot) => {
        if (importing) {
            deferredSnapshot = snapshot; // apply after the bulk import settles
            return;
        }
        applyItemsSnapshot(snapshot);
    }, (error) => {
        console.error('Error fetching data from Firestore: ', error);
        // Latch the failure so metadata's success callback cannot overwrite it.
        document.body.dataset.itemsLoadError = '1';
        setBanner('数据加载失败，当前显示的可能不是最新数据', 'error');
        const subtitle = document.getElementById('dashboard-subtitle');
        if (subtitle) {
            subtitle.textContent = '加载数据失败，请检查Firebase安全规则。';
            subtitle.classList.add('text-red-500');
        }
    });
};

// --- Metadata Listener ---
export const setupMetadataListener = () => {
    if (metadataUnsubscribe) metadataUnsubscribe();
    if (!db) return;
    const metadataRef = doc(db, 'metadata', 'dashboard');
    metadataUnsubscribe = onSnapshot(metadataRef, (docSnap) => {
        const el = document.getElementById('last-updated');
        if (!el) return;
        // Never overwrite the failure banner: a successful metadata read alongside
        // a failed items read used to make stale cached data look freshly synced.
        if (document.body.dataset.itemsLoadError === '1') return;
        if (docSnap.exists() && docSnap.data().lastManualUpdate) {
            const formatted = formatDateTime(docSnap.data().lastManualUpdate);
            el.textContent = `数据更新于 ${formatted}`;
        } else {
            el.textContent = '暂无更新记录';
        }
    }, (error) => {
        console.error('Error fetching metadata:', error);
        const el = document.getElementById('last-updated');
        if (el) el.textContent = '更新时间加载失败';
    });
};

// --- Last Modified Timestamp ---
export const updateLastModifiedTimestamp = async () => {
    try {
        await setDoc(doc(db, 'metadata', 'dashboard'), { lastManualUpdate: new Date() }, { merge: true });
    } catch (error) {
        console.error('Error updating last modified timestamp:', error);
    }
};

// --- CRUD Helpers ---
export const saveItem = async (fbId, itemData) => {
    if (!itemsCollectionRef) throw new Error('Firestore not initialized');
    const ref = fbId ? doc(itemsCollectionRef, fbId) : doc(itemsCollectionRef);
    await setDoc(ref, itemData, { merge: true });
};

export const deleteItem = async (fbId) => {
    if (!itemsCollectionRef) throw new Error('Firestore not initialized');
    await deleteDoc(doc(itemsCollectionRef, fbId));
};

// --- CSV Import (bulk replace) ---
export const bulkReplaceItems = async (newItems) => {
    if (importing) throw new Error('正在导入中，请勿重复操作');
    if (!itemsCollectionRef) throw new Error('Firestore not initialized');

    // The flag is set BEFORE the backup read so no snapshot can slip between
    // "import started" and "renders suppressed".
    importing = true;
    try {
        await runBulkReplace({
            newItems,
            readAll: async () => {
                const snapshot = await getDocs(query(itemsCollectionRef));
                return snapshot.docs.map((d) => ({ ref: d.ref, data: d.data() }));
            },
            createRef: () => doc(itemsCollectionRef),
            commitDelete: async (refs) => {
                const batch = writeBatch(db);
                refs.forEach((ref) => batch.delete(ref));
                await batch.commit();
            },
            commitSet: async (writes) => {
                const batch = writeBatch(db);
                writes.forEach(({ ref, data }) => batch.set(ref, data));
                await batch.commit();
            },
        });
    } catch (error) {
        // The core has already cleaned up this run's new refs and restored the
        // backup (or attached cleanup/restore errors to `error`). Do not restore
        // a second time here.
        console.error('Bulk replace failed:', error.message);
        throw error;
    } finally {
        importing = false;
        // The listener intentionally ignored snapshots during the import. Apply
        // the newest one now so the table/charts cannot get stuck on pre-import
        // (or mid-delete) data when no further event arrives.
        if (deferredSnapshot) {
            const pending = deferredSnapshot;
            deferredSnapshot = null;
            try {
                applyItemsSnapshot(pending);
            } catch (e) {
                console.error('Failed to apply deferred snapshot:', e);
            }
        }
    }
};
