const MINUTES_PER_HOUR = 60;

const toNonNegativeMinutes = (value) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : 0;
};

const shouldUseSteamPlaytime = (item) => Boolean(item && item.steam_app_id != null && item.steam_override !== false && item.type !== "drama" && item.type !== "hardware");

const getMonthKey = (date) => {
  const observed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(observed.getTime())) return null;
  return `${observed.getUTCFullYear()}-${String(observed.getUTCMonth() + 1).padStart(2, "0")}`;
};

const computeDelta = (previous, current) => {
  const previousMinutes = toNonNegativeMinutes(previous);
  const currentMinutes = toNonNegativeMinutes(current);
  if (currentMinutes > previousMinutes) {
    return {deltaMinutes: currentMinutes - previousMinutes, anomaly: null};
  }
  if (currentMinutes < previousMinutes) {
    return {
      deltaMinutes: 0,
      anomaly: {
        type: "counter-decreased",
        previousMinutes,
        currentMinutes,
      },
    };
  }
  return {deltaMinutes: 0, anomaly: null};
};

const buildSnapshotChanges = ({games, states, trackingInitialized, observedAt}) => {
  const month = getMonthKey(observedAt);
  const stateChanges = [];
  const monthDeltas = {};
  const anomalies = [];

  for (const game of games || []) {
    const appId = Number(game.appid);
    if (!Number.isInteger(appId) || appId < 0) continue;
    const currentMinutes = toNonNegativeMinutes(game.playtime_forever);
    const existing = states.get(String(appId));

    if (!trackingInitialized) {
      stateChanges.push({
        appId,
        name: game.name || existing?.name || String(appId),
        initialTotalMinutes: currentMinutes,
        initialObservedAt: observedAt,
        lastTotalMinutes: currentMinutes,
        lastObservedAt: observedAt,
        firstSeenMode: "baseline",
        lastDeltaMinutes: 0,
        anomalyCount: existing?.anomalyCount || 0,
        lastAnomaly: null,
      });
      continue;
    }

    if (!existing) {
      const deltaMinutes = currentMinutes > 0 ? currentMinutes : 0;
      if (deltaMinutes > 0 && month) monthDeltas[appId] = deltaMinutes;
      stateChanges.push({
        appId,
        name: game.name || String(appId),
        initialTotalMinutes: currentMinutes,
        initialObservedAt: observedAt,
        lastTotalMinutes: currentMinutes,
        lastObservedAt: observedAt,
        firstSeenMode: "new-after-tracking",
        lastDeltaMinutes: deltaMinutes,
        anomalyCount: 0,
        lastAnomaly: null,
      });
      continue;
    }

    const {deltaMinutes, anomaly} = computeDelta(existing.lastTotalMinutes, currentMinutes);
    if (deltaMinutes > 0 && month) monthDeltas[appId] = deltaMinutes;
    if (anomaly) anomalies.push({appId, ...anomaly, observedAt});
    stateChanges.push({
      ...existing,
      appId,
      name: game.name || existing.name || String(appId),
      lastTotalMinutes: currentMinutes,
      lastObservedAt: observedAt,
      lastDeltaMinutes: deltaMinutes,
      anomalyCount: (existing.anomalyCount || 0) + (anomaly ? 1 : 0),
      lastAnomaly: anomaly ? {...anomaly, observedAt} : (existing.lastAnomaly || null),
    });
  }

  return {month, stateChanges, monthDeltas, anomalies};
};

module.exports = {
  MINUTES_PER_HOUR,
  toNonNegativeMinutes,
  shouldUseSteamPlaytime,
  getMonthKey,
  computeDelta,
  buildSnapshotChanges,
};
