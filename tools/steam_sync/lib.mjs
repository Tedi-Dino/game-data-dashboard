// tools/steam_sync/lib.mjs — pure planning helpers for the Spark-plan Steam
// sync. No I/O, no firebase-admin, no Steam calls: everything here takes plain
// objects and returns plain objects so it can be unit-tested.
//
// The shapes deliberately mirror functions/index.js `syncSteamItemsAndAchievements`
// and `collectSteamPlaytimeSnapshot`. If you change one side, change the other;
// tools/tests/free-tier.test.mjs guards the field names.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Shared with the Cloud Function so both paths match names identically.
const { canLinkSteamItem, canReceiveSteamPlaytime, fuzzyMatch } = require(
    path.join(repoRoot, 'functions/steam-sync-core.js')
);

export { canLinkSteamItem, canReceiveSteamPlaytime, fuzzyMatch };

// Firestore documents are capped at 1 MiB. The Cloud Function switches to an
// `apps` subcollection above 750 KB; the local runner refuses instead of
// silently diverging (a dashboard with ~100 games never gets close).
export const MONTH_DOC_LIMIT_BYTES = 750 * 1024;

export const SCHEMA_VERSION = 1;

const roundHours = (minutes) => Math.round((Number(minutes) || 0) / 60 * 100) / 100;

/**
 * Build the per-item Firestore updates for matched Steam games.
 *
 * @param {object} params
 * @param {Map<string, {app_id: number, playtime_minutes: number}>} params.matched
 * @param {Array<object>} params.allItems      every row from the `items` collection
 * @param {Map<number, Array|null>} params.achievementsByApp  app_id -> achievements
 * @param {Date} params.observedAt
 * @returns {{updates: Array<{fbId: string, fields: object}>, updated: number,
 *            achievementsChecked: number, fullyCompletedCount: number}}
 */
export function buildItemUpdates({ matched, allItems, achievementsByApp, observedAt }) {
    const byFbId = new Map(allItems.map((item) => [item.fb_id, item]));
    const updates = [];
    let updated = 0;
    let achievementsChecked = 0;
    let fullyCompletedCount = 0;

    for (const [fbId, info] of matched) {
        const item = byFbId.get(fbId);
        const steamPlaytimeHours = roundHours(info.playtime_minutes);
        const fields = {
            steam_app_id: info.app_id,
            steam_last_sync: observedAt,
        };

        // Only write playTime for rows allowed to receive Steam data, and never
        // lower a manually entered value. Matches the Cloud Function exactly.
        if (canReceiveSteamPlaytime(item) && steamPlaytimeHours > (Number(item?.playTime) || 0)) {
            fields.playTime = steamPlaytimeHours;
            updated++;
        }

        const achievements = achievementsByApp?.get(info.app_id);
        if (Array.isArray(achievements) && achievements.length > 0) {
            achievementsChecked++;
            const allAchieved = achievements.every((a) => a.achieved === 1);
            fields.fullyCompleted = allAchieved;
            if (allAchieved) fullyCompletedCount++;
        }

        updates.push({ fbId, fields });
    }

    return { updates, updated, achievementsChecked, fullyCompletedCount };
}

/**
 * Merge this run's per-app minute deltas into the month document.
 *
 * @param {object} params
 * @param {Record<string, number>} params.monthDeltas  appId -> minutes gained
 * @param {object|null} params.existingMonth           current month doc (may be null)
 * @param {string} params.monthKey                     "YYYY-MM"
 * @param {Date} params.observedAt
 * @returns {{fields: object, oversized: boolean, sizeBytes: number}}
 */
export function mergeMonthDeltas({ monthDeltas, existingMonth, monthKey, observedAt }) {
    const minutesByApp = { ...(existingMonth?.minutesByApp || {}) };
    for (const [appId, minutes] of Object.entries(monthDeltas || {})) {
        minutesByApp[appId] = (Number(minutesByApp[appId]) || 0) + (Number(minutes) || 0);
    }

    const trackedTotalMinutes = Object.values(minutesByApp)
        .reduce((sum, value) => sum + (Number(value) || 0), 0);

    const sizeBytes = Buffer.byteLength(JSON.stringify(minutesByApp), 'utf8');

    return {
        oversized: sizeBytes >= MONTH_DOC_LIMIT_BYTES,
        sizeBytes,
        fields: {
            month: monthKey,
            minutesByApp,
            trackedTotalMinutes,
            firstObservedAt: existingMonth?.firstObservedAt instanceof Date
                ? existingMonth.firstObservedAt
                : observedAt,
            lastObservedAt: observedAt,
            updatedAt: observedAt,
        },
    };
}

/**
 * `metadata/steamSync` — the document the dashboard renders as
 * "Steam: 上次同步 ...".
 */
export function buildSyncMetadata({ matched, unmatched, achievementsChecked, fullyCompletedCount, observedAt }) {
    const unmatchedTop = unmatched.slice(0, 50);
    return {
        lastSyncTime: observedAt,
        matchedCount: matched.size,
        unmatchedCount: unmatched.length,
        unmatchedGames: unmatchedTop,
        achievementsChecked,
        fullyCompletedCount,
    };
}

/**
 * `metadata/steamPlaytimeTracking` — mirrors the Cloud Function, including the
 * `initializedAt` marker written only on the first ever run.
 */
export function buildTrackingMetadata({ trackingInitialized, anomalies, runId, observedAt }) {
    const metadata = {
        schemaVersion: SCHEMA_VERSION,
        lastCompletedAt: observedAt,
        lastRunId: runId,
        coverage: trackingInitialized ? 'active' : 'partial-first-month',
        lastError: anomalies.length ? `${anomalies.length} Steam累计时长下降异常` : null,
        lastTrigger: 'local',
    };
    if (!trackingInitialized) metadata.initializedAt = observedAt;
    return metadata;
}

/**
 * Attach an id to every `steamPlaytimeState` document, matching what the Admin
 * SDK batch writes (stateChanges already carry appId as a number field).
 */
export const toStateDocuments = (stateChanges) => stateChanges.map((state) => ({
    docId: String(state.appId),
    fields: state,
}));
