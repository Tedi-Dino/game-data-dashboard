import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, query, writeBatch } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../config/firebase.js';
import { setItems } from '../core/state.js';
import { formatDateTime } from '../core/utils.js';

let itemsCollectionRef = null;
let unsubscribe = null;
let metadataUnsubscribe = null;

// Callback invoked whenever items update (set by main.js)
let onDataChange = null;

export const setOnDataChange = (fn) => { onDataChange = fn; };

// --- Firestore Items Listener ---
export const setupFirestoreListener = () => {
    if (unsubscribe) unsubscribe();
    itemsCollectionRef = collection(db, 'items');
    unsubscribe = onSnapshot(itemsCollectionRef, (snapshot) => {
        if (importing) return; // skip partial renders during bulk import
        setItems(snapshot.docs.map(doc => ({ fb_id: doc.id, ...doc.data() })));
        if (onDataChange) onDataChange();
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
        await setDoc(doc(db, 'metadata', 'dashboard'), { lastManualUpdate: new Date() });
    } catch (error) {
        console.error('Error updating last modified timestamp:', error);
    }
};

// --- CRUD Helpers ---
export const saveItem = async (fbId, itemData) => {
    const ref = fbId ? doc(itemsCollectionRef, fbId) : doc(itemsCollectionRef);
    await setDoc(ref, itemData, { merge: true });
};

export const deleteItem = async (fbId) => {
    await deleteDoc(doc(itemsCollectionRef, fbId));
};

// --- CSV Import (bulk replace) ---
let importing = false;
export const isImporting = () => importing;

export const bulkReplaceItems = async (newItems) => {
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
        console.error('Bulk replace failed, restoring backup:', error);
        // Attempt to restore from backup if insertion failed after deletion
        for (let i = 0; i < backup.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            backup.slice(i, i + BATCH_LIMIT).forEach(item => {
                const ref = doc(itemsCollectionRef, item.fb_id);
                batch.set(ref, item);
            });
            await batch.commit();
        }
        throw error;
    } finally {
        importing = false;
    }
};
