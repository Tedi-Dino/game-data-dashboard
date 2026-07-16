import { collection, doc, getDocs, onSnapshot, query } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { db } from '../config/firebase.js';
import { setSteamPlaytimeMonths, setSteamPlaytimeStates, setSteamPlaytimeTracking } from '../core/state.js';

let monthsUnsubscribe = null;
let trackingUnsubscribe = null;
let statesUnsubscribe = null;
let onUpdate = null;

const notify = () => { if (onUpdate) onUpdate(); };

export const setupSteamPlaytimeListener = (callback) => {
    if (monthsUnsubscribe) monthsUnsubscribe();
    if (trackingUnsubscribe) trackingUnsubscribe();
    if (statesUnsubscribe) statesUnsubscribe();
    onUpdate = callback;
    if (!db) {
        console.error('Firestore db not initialized for Steam playtime listener');
        return () => {};
    }

    const monthsRef = collection(db, 'steamPlaytimeMonths');
    monthsUnsubscribe = onSnapshot(monthsRef, async (snapshot) => {
        const months = new Map();
        const subcollectionReads = [];
        snapshot.docs.forEach((monthDoc) => {
            const data = monthDoc.data() || {};
            if (data.minutesByApp && typeof data.minutesByApp === 'object') {
                months.set(monthDoc.id, data);
            } else {
                subcollectionReads.push(getDocs(query(collection(monthDoc.ref, 'apps'))).then((apps) => {
                    const minutesByApp = {};
                    apps.docs.forEach((appDoc) => { minutesByApp[appDoc.id] = Number(appDoc.data()?.minutes || 0); });
                    months.set(monthDoc.id, {...data, month: monthDoc.id, minutesByApp});
                }).catch((error) => console.error(`Steam playtime app data failed for ${monthDoc.id}:`, error)));
            }
        });
        await Promise.all(subcollectionReads);
        setSteamPlaytimeMonths(months);
        notify();
    }, (error) => {
        console.error('Error fetching Steam playtime months:', error);
        setSteamPlaytimeMonths(new Map());
        notify();
    });

    const statesRef = collection(db, 'steamPlaytimeState');
    statesUnsubscribe = onSnapshot(statesRef, (snapshot) => {
        const states = new Map(snapshot.docs.map((stateDoc) => [stateDoc.id, stateDoc.data()]));
        setSteamPlaytimeStates(states);
        notify();
    }, (error) => {
        console.error('Error fetching Steam playtime states:', error);
        setSteamPlaytimeStates(new Map());
        notify();
    });

    const trackingRef = doc(db, 'metadata', 'steamPlaytimeTracking');
    trackingUnsubscribe = onSnapshot(trackingRef, (snapshot) => {
        setSteamPlaytimeTracking(snapshot.exists() ? snapshot.data() : null);
        notify();
    }, (error) => {
        console.error('Error fetching Steam playtime tracking metadata:', error);
        setSteamPlaytimeTracking(null);
        notify();
    });

    return () => {
        if (monthsUnsubscribe) monthsUnsubscribe();
        if (trackingUnsubscribe) trackingUnsubscribe();
        if (statesUnsubscribe) statesUnsubscribe();
        monthsUnsubscribe = null;
        trackingUnsubscribe = null;
        statesUnsubscribe = null;
    };
};
