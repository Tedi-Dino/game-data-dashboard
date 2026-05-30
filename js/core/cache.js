const DB_NAME = 'game-dashboard-cache';
const DB_VERSION = 2;
const STORE_NAME = 'items';
const CACHE_KEY = 'all-items';
const CACHE_SCHEMA_VERSION = 2; // bump when Firestore item schema changes

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => { dbPromise = null; reject(e.target.error); };
    });
    return dbPromise;
}

export async function getCachedItems() {
    try {
        const database = await openDB();
        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(CACHE_KEY);
            request.onsuccess = () => {
                const result = request.result;
                // Validate schema version — discard stale cache
                if (result && result._schemaVersion !== CACHE_SCHEMA_VERSION) {
                    resolve(null);
                    return;
                }
                resolve(result?.data || null);
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function setCachedItems(items) {
    try {
        const database = await openDB();
        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({ data: items, _schemaVersion: CACHE_SCHEMA_VERSION }, CACHE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // ignore cache write errors
    }
}
