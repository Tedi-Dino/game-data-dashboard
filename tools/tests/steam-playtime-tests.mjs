import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getMonthKey, computeDelta, buildSnapshotChanges, shouldUseSteamPlaytime } = require("../../functions/steam-playtime.js");

describe("Steam playtime pure calculations", () => {
  it("uses UTC month keys", () => {
    assert.equal(getMonthKey("2026-07-16T03:00:00Z"), "2026-07");
    assert.equal(getMonthKey("2026-01-01T00:00:00Z"), "2026-01");
  });

  it("computes positive, zero, and decreased counters", () => {
    assert.deepEqual(computeDelta(120, 180), {deltaMinutes: 60, anomaly: null});
    assert.deepEqual(computeDelta(180, 180), {deltaMinutes: 0, anomaly: null});
    const result = computeDelta(180, 150);
    assert.equal(result.deltaMinutes, 0);
    assert.equal(result.anomaly.type, "counter-decreased");
  });

  it("creates a baseline without monthly deltas", () => {
    const result = buildSnapshotChanges({
      games: [{appid: 10, name: "Game", playtime_forever: 900}],
      states: new Map(),
      trackingInitialized: false,
      observedAt: new Date("2026-07-16T04:00:00Z"),
    });
    assert.equal(result.stateChanges[0].firstSeenMode, "baseline");
    assert.deepEqual(result.monthDeltas, {});
  });

  it("writes only the positive difference to the current month", () => {
    const result = buildSnapshotChanges({
      games: [{appid: 10, name: "Game", playtime_forever: 180}],
      states: new Map([["10", {appId: 10, name: "Game", initialTotalMinutes: 120, lastTotalMinutes: 120, anomalyCount: 0}]]),
      trackingInitialized: true,
      observedAt: new Date("2026-07-16T04:00:00Z"),
    });
    assert.equal(result.monthDeltas[10], 60);
    assert.equal(result.stateChanges[0].lastDeltaMinutes, 60);
  });

  it("treats a new app after tracking as current-month activity", () => {
    const result = buildSnapshotChanges({
      games: [{appid: 42, name: "New", playtime_forever: 75}],
      states: new Map(),
      trackingInitialized: true,
      observedAt: new Date("2026-07-16T04:00:00Z"),
    });
    assert.equal(result.monthDeltas[42], 75);
    assert.equal(result.stateChanges[0].firstSeenMode, "new-after-tracking");
  });

  it("does not overlap fixed history with tracked increments", () => {
    const result = buildSnapshotChanges({
      games: [{appid: 10, name: "Game", playtime_forever: 130}],
      states: new Map([["10", {appId: 10, initialTotalMinutes: 120, lastTotalMinutes: 120, anomalyCount: 0}]]),
      trackingInitialized: true,
      observedAt: new Date("2026-08-01T04:00:00Z"),
    });
    assert.equal(result.month, "2026-08");
    assert.equal(result.monthDeltas[10], 10);
  });

  it("keeps disabled Steam override out of frontend merge decisions", () => {
    assert.equal(shouldUseSteamPlaytime({steam_app_id: 10, steam_override: false}), false);
    assert.equal(shouldUseSteamPlaytime({steam_app_id: 10, steam_override: true, type: "steam"}), true);
    assert.equal(shouldUseSteamPlaytime({steam_app_id: 10, type: "drama"}), false);
  });
});
