import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, query, writeBatch } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../config/firebase.js';
import { setItems } from '../core/state.js';
import { formatDateTime } from '../core/utils.js';
import { getCachedItems, setCachedItems } from '../core/cache.js';

let itemsCollectionRef = null;
let unsubscribe = null;
let metadataUnsubscribe = null;

// Callback invoked whenever items update (set by main.js)
let onDataChange = null;

export const setOnDataChange = (fn) => { onDataChange = fn; };

// --- Firestore Items Listener ---
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
        if (onDataChange) { try { onDataChange(); } catch (e) { console.error('onDataChange error (cache):', e); } }
    }

    // Then set up real-time Firestore listener
    unsubscribe = onSnapshot(itemsCollectionRef, (snapshot) => {
        if (importing) return; // skip partial renders during bulk import
        const items = snapshot.docs.map(doc => ({ fb_id: doc.id, ...doc.data() }));
        setItems(items);
        setCachedItems(items); // update cache
        if (onDataChange) { try { onDataChange(); } catch (e) { console.error('onDataChange error:', e); } }
    }, (error) => {
        console.error('Error fetching data from Firestore: ', error);
        const lastUpdated = document.getElementById('last-updated');
        const subtitle = document.getElementById('dashboard-subtitle');
        if (lastUpdated) lastUpdated.textContent = '数据加载失败';
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
let importing = false;
export const isImporting = () => importing;

export const bulkReplaceItems = async (newItems) => {
    if (importing) throw new Error('正在导入中，请勿重复操作');
    if (!itemsCollectionRef) throw new Error('Firestore not initialized');

    // Backup current items in case partial failure leaves empty state
    const snapshot = await getDocs(query(itemsCollectionRef));
    const backup = snapshot.docs.map(d => ({ fb_id: d.id, ...d.data() }));
    const BATCH_LIMIT = 400; // conservative: Firestore hard limit is 500

    importing = true;
    try {
        // Delete in chunks
        const allDocs = snapshot.docs;
        for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            allDocs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        // Insert in chunks
        for (let i = 0; i < newItems.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            newItems.slice(i, i + BATCH_LIMIT).forEach(item => {
                const newDocRef = doc(itemsCollectionRef);
                batch.set(newDocRef, item);
            });
            await batch.commit();
        }
    } catch (error) {
        console.error('Bulk replace failed, attempting to restore backup:', error);
        // Attempt to restore from backup — with its own error handling
        try {
            for (let i = 0; i < backup.length; i += BATCH_LIMIT) {
                const batch = writeBatch(db);
                backup.slice(i, i + BATCH_LIMIT).forEach(item => {
                    const ref = doc(itemsCollectionRef, item.fb_id);
                    batch.set(ref, item);
                });
                await batch.commit();
            }
            console.warn('Backup restored successfully after failed import.');
        } catch (restoreError) {
            console.error('CRITICAL: Backup restore ALSO failed!', restoreError);
            console.error('Data may be lost. Original error:', error.message);
        }
        throw error;
    } finally {
        importing = false;
    }
};
