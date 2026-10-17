// Guards the Spark (free-tier) build: the feature switches must stay coherent,
// the browser must never reach a Cloud Function that cannot be deployed, and the
// local Steam runner must write exactly what the Cloud Function writes.
//
// Run with: node --test tools/tests/*.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    buildItemUpdates,
    buildSyncMetadata,
    buildTrackingMetadata,
    mergeMonthDeltas,
    MONTH_DOC_LIMIT_BYTES,
} from "../steam_sync/lib.mjs";
import { buildCommitPayload } from "../steam_sync/firestore.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const require = createRequire(import.meta.url);

const constants = await import(
    pathToFileURL(path.join(repoRoot, "js/config/constants.js")).href
);
const core = require(path.join(repoRoot, "functions/steam-sync-core.js"));

describe("FEATURES switches", () => {
    it("exposes the documented flags as booleans", () => {
        const { FEATURES } = constants;
        assert.deepEqual(Object.keys(FEATURES).sort(),
            ["AI_LOCAL_ONLY", "APP_CHECK", "SCHEDULED_SYNC", "STEAM_SYNC"]);
        for (const [key, value] of Object.entries(FEATURES)) {
            assert.equal(typeof value, "boolean", `${key} must be boolean`);
        }
    });

    it("never schedules a sync without the callable that performs it", () => {
        const { FEATURES } = constants;
        if (FEATURES.SCHEDULED_SYNC) {
            assert.equal(FEATURES.STEAM_SYNC, true,
                "SCHEDULED_SYNC requires STEAM_SYNC — Cloud Scheduler rides on Cloud Functions");
        }
    });

    it("keeps the browser in step with the deployable surface", () => {
        // The deployed hosting bundle and the feature switches have to agree.
        // A firebase.json without a `functions` block means the project cannot
        // deploy callables at all, so the browser must not try to call them.
        // Restoring functions + flipping the flags keeps this green.
        const firebaseJson = JSON.parse(read("firebase.json"));
        const { FEATURES } = constants;
        if (!firebaseJson.functions) {
            assert.equal(FEATURES.STEAM_SYNC, false,
                "firebase.json has no functions block but STEAM_SYNC is on");
            assert.equal(FEATURES.SCHEDULED_SYNC, false,
                "firebase.json has no functions block but SCHEDULED_SYNC is on");
        }
    });
});

describe("browser never reaches a non-existent callable", () => {
    it("steam.js guards triggerSteamSync with FEATURES.STEAM_SYNC", () => {
        const src = read("js/services/steam.js");
        assert.match(src, /import \{[^}]*FEATURES[^}]*\} from '\.\.\/config\/constants\.js'/);
        const guardIndex = src.indexOf("if (!isSteamSyncAvailable())");
        const callIndex = src.indexOf("httpsCallable(functions");
        assert.ok(guardIndex > 0, "missing isSteamSyncAvailable() guard");
        assert.ok(guardIndex < callIndex, "guard must precede the callable construction");
    });

    it("main.js does not wire the sync button without STEAM_SYNC", () => {
        const src = read("js/main.js");
        const wiring = src.indexOf("if (steamSyncBtn && FEATURES.STEAM_SYNC)");
        assert.ok(wiring > 0, "sync button listener must be gated on FEATURES.STEAM_SYNC");
    });

    it("auth.js does not un-hide the sync button without STEAM_SYNC", () => {
        const src = read("js/ui/auth.js");
        assert.match(src, /if \(steamSyncBtn && FEATURES\.STEAM_SYNC\)/);
    });

    it("recommendations.js short-circuits the Cloud Function when AI_LOCAL_ONLY", () => {
        const src = read("js/services/recommendations.js");
        const flagIndex = src.indexOf("if (FEATURES.AI_LOCAL_ONLY)");
        const callIndex = src.indexOf("await callCloudFunction(");
        assert.ok(flagIndex > 0, "missing AI_LOCAL_ONLY branch");
        assert.ok(flagIndex < callIndex, "AI_LOCAL_ONLY branch must precede the cloud call");
    });

    it("App Check is opt-in and cannot take Firestore down with it", () => {
        const src = read("js/config/firebase.js");
        const gate = src.indexOf("if (FEATURES.APP_CHECK) {");
        const appCheck = src.indexOf("initializeAppCheck(app");
        const services = src.indexOf("auth = getAuth(app)");
        assert.ok(gate > 0, "App Check must be gated by FEATURES.APP_CHECK");
        assert.ok(gate < appCheck, "the gate must precede initializeAppCheck");
        assert.ok(appCheck < services, "getAuth/getFirestore must not be nested inside the App Check block");
        // Each call needs its own try: the old shared try left `db` undefined.
        assert.match(src.slice(gate, appCheck), /try \{/);
        assert.match(src.slice(appCheck, services), /try \{/);
    });
});

describe("shared Steam matching core", () => {
    it("functions/index.js imports matching instead of re-defining it", () => {
        const src = read("functions/index.js");
        assert.match(src, /require\("\.\/steam-sync-core\.js"\)/);
        assert.doesNotMatch(src, /function normalizeName/);
        assert.doesNotMatch(src, /function levenshtein/);
        assert.doesNotMatch(src, /function fuzzyMatch/);
    });

    it("matches by pinned app id, then by normalized name, without double-binding", () => {
        const items = [
            { fb_id: "a", name: "城市：天际线", type: "steam", playTime: 10, steam_app_id: 255710 },
            { fb_id: "b", name: "Doki Doki Literature Club!", type: "steam", playTime: 5 },
            { fb_id: "c", name: "心跳文学部", type: "steam", playTime: 6 },
        ];
        const games = [
            { appid: 255710, name: "Cities: Skylines", playtime_forever: 600 },
            { appid: 698780, name: "Doki Doki Literature Club", playtime_forever: 120 },
        ];
        const { matched } = core.fuzzyMatch(games, items);
        assert.equal(matched.get("a").app_id, 255710, "pinned id wins");
        assert.equal(matched.get("b").app_id, 698780, "normalized-name match binds the unpinned row");
        assert.equal(matched.size, 2, "one app per row");
    });

    it("keeps dramas and hardware out of the candidate set", () => {
        assert.equal(core.canLinkSteamItem({ type: "drama" }), false);
        assert.equal(core.canLinkSteamItem({ type: "hardware" }), false);
        assert.equal(core.canLinkSteamItem({ type: "steam", steam_override: false }), false);
        assert.equal(core.canLinkSteamItem({ type: "steam" }), true);
    });
});

describe("local runner writes the same shapes as the Cloud Function", () => {
    const observedAt = new Date("2026-10-18T00:00:00.000Z");
    const matched = new Map([
        ["a", { app_id: 1, playtime_minutes: 600 }],   // 10h, existing 5h -> raise
        ["b", { app_id: 2, playtime_minutes: 60 }],    // 1h, existing 5h -> keep
        ["c", { app_id: 3, playtime_minutes: 300 }],   // drama, never gets playTime
    ]);
    const allItems = [
        { fb_id: "a", name: "A", type: "steam", playTime: 5 },
        { fb_id: "b", name: "B", type: "steam", playTime: 5 },
        { fb_id: "c", name: "C", type: "drama", playTime: 5 },
    ];

    it("raises playTime only for steam rows and only upwards", () => {
        const plan = buildItemUpdates({ matched, allItems, achievementsByApp: new Map(), observedAt });
        const byId = Object.fromEntries(plan.updates.map((u) => [u.fbId, u.fields]));
        assert.equal(byId.a.playTime, 10);
        assert.equal("playTime" in byId.b, false, "a lower Steam value must not overwrite a manual one");
        assert.equal("playTime" in byId.c, false, "dramas never receive Steam playtime");
        assert.equal(plan.updated, 1);
        for (const fields of Object.values(byId)) {
            assert.equal(fields.steam_last_sync, observedAt);
            assert.ok(Number.isInteger(fields.steam_app_id));
        }
    });

    it("derives fullyCompleted from achievements", () => {
        const achievementsByApp = new Map([
            [1, [{ achieved: 1 }, { achieved: 1 }]],
            [2, [{ achieved: 1 }, { achieved: 0 }]],
        ]);
        const plan = buildItemUpdates({ matched, allItems, achievementsByApp, observedAt });
        const byId = Object.fromEntries(plan.updates.map((u) => [u.fbId, u.fields]));
        assert.equal(byId.a.fullyCompleted, true);
        assert.equal(byId.b.fullyCompleted, false);
        assert.equal(plan.achievementsChecked, 2);
        assert.equal(plan.fullyCompletedCount, 1);
    });

    it("accumulates month deltas onto the existing document", () => {
        const month = mergeMonthDeltas({
            monthDeltas: { 1: 30, 2: 15 },
            existingMonth: { minutesByApp: { 1: 100 }, firstObservedAt: new Date("2026-10-01T00:00:00Z") },
            monthKey: "2026-10",
            observedAt,
        });
        assert.equal(month.fields.minutesByApp["1"], 130);
        assert.equal(month.fields.minutesByApp["2"], 15);
        assert.equal(month.fields.trackedTotalMinutes, 145);
        assert.equal(month.fields.month, "2026-10");
        assert.equal(month.fields.lastObservedAt, observedAt);
        assert.deepEqual(month.fields.firstObservedAt, new Date("2026-10-01T00:00:00Z"),
            "firstObservedAt must survive later runs");
        assert.equal(month.oversized, false);
    });

    it("flags a month document that would exceed the size cap", () => {
        const huge = {};
        for (let i = 0; i < 60000; i++) huge[i] = 12345;
        const month = mergeMonthDeltas({ monthDeltas: {}, existingMonth: { minutesByApp: huge }, monthKey: "2026-10", observedAt });
        assert.ok(month.sizeBytes >= MONTH_DOC_LIMIT_BYTES);
        assert.equal(month.oversized, true);
    });

    it("writes metadata keys the Cloud Function also writes", () => {
        const fnSrc = read("functions/index.js");
        const syncMeta = buildSyncMetadata({
            matched,
            unmatched: [{ app_id: 9, name: "X", playtime_hours: 1 }],
            achievementsChecked: 2,
            fullyCompletedCount: 1,
            observedAt,
        });
        for (const key of Object.keys(syncMeta)) {
            assert.ok(fnSrc.includes(`${key}:`), `metadata/steamSync.${key} is not written by the Cloud Function`);
        }
        assert.equal(syncMeta.unmatchedCount, 1);
        assert.equal(syncMeta.unmatchedGames.length, 1);

        const trackingMeta = buildTrackingMetadata({
            trackingInitialized: false, anomalies: [], runId: "run", observedAt,
        });
        assert.equal(trackingMeta.coverage, "partial-first-month");
        assert.equal(trackingMeta.initializedAt, observedAt);
        for (const key of Object.keys(trackingMeta)) {
            assert.ok(fnSrc.includes(`${key}:`) || fnSrc.includes(`${key} =`),
                `metadata/steamPlaytimeTracking.${key} is not written by the Cloud Function`);
        }
    });
});

describe("commit payload", () => {
    it("uses an update mask for merges and no mask for full replaces", () => {
        const payload = buildCommitPayload([
            { docPath: "items/a", fields: { playTime: 10, steam_app_id: 1 }, mask: ["playTime", "steam_app_id"] },
            { docPath: "steamPlaytimeState/1", fields: { appId: 1, lastTotalMinutes: 600 } },
        ]);
        assert.deepEqual(payload.writes[0].updateMask.fieldPaths, ["playTime", "steam_app_id"]);
        assert.equal(payload.writes[1].updateMask, undefined);
        assert.equal(
            payload.writes[0].update.name,
            "projects/game-data-dashboard/databases/(default)/documents/items/a"
        );
        assert.equal(payload.writes[0].update.fields.playTime.integerValue, "10");
        assert.equal(payload.writes[1].update.fields.appId.integerValue, "1");
    });

    it("encodes Dates as timestamps and skips undefined", () => {
        const payload = buildCommitPayload([{
            docPath: "metadata/x",
            fields: { when: new Date("2026-10-18T00:00:00.000Z"), missing: undefined },
            mask: ["when"],
        }]);
        assert.equal(payload.writes[0].update.fields.when.timestampValue, "2026-10-18T00:00:00.000Z");
        assert.equal("missing" in payload.writes[0].update.fields, false);
    });
});
