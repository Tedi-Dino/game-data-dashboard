// functions/index.js — Firebase Cloud Function
// Calls DeepSeek API for AI game recommendations

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const {
  getMonthKey,
  buildSnapshotChanges,
} = require("./steam-playtime.js");

admin.initializeApp();

// Define secrets
const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");
const STEAM_API_KEY = defineSecret("STEAM_API_KEY");

const STEAM_ID = "76561199530798696";

// Admin UIDs — must match js/config/constants.js
const ADMIN_UIDS = ["ZPyHfPGUI4elNvRN2Q30ZqfzT6X2"];

const FUNCTION_LIMITS = {
  aiRecommendations: {cooldownMs: 60 * 1000, maxPerDay: 30},
  steamSync: {cooldownMs: 10 * 60 * 1000, maxPerDay: 12},
};

async function claimFunctionQuota(name, uid) {
  const limit = FUNCTION_LIMITS[name];
  const nowMillis = Date.now();
  const dayKey = new Date(nowMillis).toISOString().slice(0, 10);
  const ref = admin.firestore().doc(`functionRateLimits/${name}_${uid}_${dayKey}`);

  const result = await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const lastAllowedMillis = typeof data.lastAllowedAt?.toMillis === "function"
      ? data.lastAllowedAt.toMillis()
      : 0;
    const count = Number(data.count || 0);
    const retryAfterMs = Math.max(0, limit.cooldownMs - (nowMillis - lastAllowedMillis));

    if (retryAfterMs > 0) return {allowed: false, retryAfterMs, reason: "cooldown"};
    if (count >= limit.maxPerDay) return {allowed: false, retryAfterMs: 0, reason: "daily-limit"};

    transaction.set(ref, {
      functionName: name,
      uid,
      dayKey,
      count: count + 1,
      lastAllowedAt: admin.firestore.Timestamp.fromMillis(nowMillis),
      expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis + 3 * 24 * 60 * 60 * 1000),
    }, {merge: true});
    return {allowed: true};
  });

  if (!result.allowed) {
    const message = result.reason === "daily-limit"
      ? "今日调用次数已达上限，请明天再试。"
      : `请求过于频繁，请在${Math.ceil(result.retryAfterMs / 1000)}秒后重试。`;
    throw new HttpsError("resource-exhausted", message, {
      reason: result.reason,
      retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
    });
  }
}

exports.getAiRecommendations = onCall({
  secrets: [deepseekApiKey],
  timeoutSeconds: 90,
  maxInstances: 2,
  concurrency: 2,
  enforceAppCheck: true,
  consumeAppCheckToken: true,
}, async (request) => {
  // Admin-only access
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "只有管理员才能使用AI推荐功能。");
  }

  const DEEPSEEK_API_KEY = deepseekApiKey.value();
  if (!DEEPSEEK_API_KEY) {
    logger.error("DEEPSEEK_API_KEY secret is not set");
    return { output: { text: "" }, error: "DEEPSEEK_API_KEY 未配置。请在 Firebase 中设置此密钥: firebase functions:secrets:set DEEPSEEK_API_KEY" };
  }

  const { passedGames, unpassedGames, passedDramas, unpassedDramas, customPrompt, thinking } = request.data;

  // Input validation
  const MAX_FIELD_LENGTH = 10000;
  const MAX_PROMPT_LENGTH = 500;
  const stringFields = { passedGames, unpassedGames, passedDramas, unpassedDramas };
  for (const [key, val] of Object.entries(stringFields)) {
    if (val && typeof val !== 'string') {
      throw new HttpsError("invalid-argument", `${key} 必须是字符串。`);
    }
    if (val && val.length > MAX_FIELD_LENGTH) {
      throw new HttpsError("invalid-argument", `${key} 超过最大长度限制。`);
    }
  }
  if (customPrompt && typeof customPrompt !== 'string') {
    throw new HttpsError("invalid-argument", "customPrompt 必须是字符串。");
  }
  if (customPrompt && customPrompt.length > MAX_PROMPT_LENGTH) {
    throw new HttpsError("invalid-argument", `自定义需求不能超过${MAX_PROMPT_LENGTH}个字符。`);
  }
  if (thinking !== undefined && typeof thinking !== "boolean") {
    throw new HttpsError("invalid-argument", "thinking 必须是布尔值。");
  }
  await claimFunctionQuota("aiRecommendations", request.auth.uid);

  const prompt = `你是一个资深的影音娱乐推荐助手。请分析一个用户的游戏和剧集数据。

### 用户【已通关】的游戏 (包含用户评分 1-10分):
${passedGames || "无"}

### 用户【未通关】的游戏 (包含当前状态):
${unpassedGames || "无"}

### 用户【已看完】的剧集 (包含用户评分 1-10分和类型):
${passedDramas || "无"}

### 用户【未看完】的剧集 (包含当前状态):
${unpassedDramas || "无"}

### 用户的额外需求:
${customPrompt || "无特定需求，请综合推荐。"}

### 你的任务:
请根据用户的数据（特别是高分内容）来分析他的品味，并结合他的【额外需求】，为他推荐4款游戏和1部剧集。
1.  **首要目标**: 优先从"未通关/未看完"列表中推荐最匹配的内容。
2.  **次要目标**: 如果"额外需求"很明确（例如 "想玩xx类型"或"想看xx类型的剧"），并且列表中没有匹配的，**请推荐不在该列表中的新内容**。
3.  如果"额外需求"为空，请主要从"未通关/未看完"列表中推荐。
4.  理由应简短（不超过50字），并说明为什么推荐。
5.  按推荐优先级从高到低排序。
6.  请在推荐中标明类型（游戏或剧集）。

请严格按照以下JSON格式返回，不要包含任何多余的解释、代码块标记或标题。
[
  {"name": "游戏名1", "reason": "推荐理由1...", "type": "游戏"},
  {"name": "游戏名2", "reason": "推荐理由2...", "type": "游戏"},
  {"name": "游戏名3", "reason": "推荐理由3...", "type": "游戏"},
  {"name": "游戏名4", "reason": "推荐理由4...", "type": "游戏"},
  {"name": "剧集名1", "reason": "推荐理由5...", "type": "剧集"}
]`;

  try {
    logger.info("Calling DeepSeek API, model: deepseek-v4-pro");
    const response = await fetch(
        "https://api.deepseek.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-v4-pro",
            messages: [
              { role: "user", content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.3,
            ...(thinking ? { thinking: { type: "enabled", reasoning_effort: "high" } } : { thinking: { type: "disabled" } }),
          }),
        },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error("DeepSeek API Error:", response.status, JSON.stringify(errorData));
      return { output: { text: "" }, error: `DeepSeek API 返回错误 (${response.status}): ${JSON.stringify(errorData)}` };
    }

    const data = await response.json();

    // DeepSeek response format (OpenAI-compatible):
    // { choices: [{ message: { content: "..." } }] }
    logger.info("DeepSeek raw response keys:", JSON.stringify(Object.keys(data)));
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    let textContent = msg?.content || "";

    if (!textContent && msg) {
      logger.warn("message.content is empty. Full message keys:", JSON.stringify(Object.keys(msg)));
      logger.warn("Full message:", JSON.stringify(msg));
    }

    logger.info("DeepSeek response received, length:", textContent.length);

    return {
      output: {
        text: textContent
      }
    };

  } catch (error) {
    logger.error("Error calling getAiRecommendations:", error.message, error.stack);
    return { output: { text: "" }, error: `Cloud Function 内部错误: ${error.message}` };
  }
});

// ============================================================
// Steam Sync — Fuzzy Name Matching + Playtime Sync
// ============================================================

function normalizeName(name) {
  return name
    .replace(/™|\(R\)|\(C\)|®|©|℠/g, '')
    .replace(/game of the year|goty|deluxe|standard|edition/gi, '')
    .replace(/[^\w一-鿿]/g, '')
    .toLowerCase()
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyMatch(steamGames, existingItems) {
  const matched = new Map();
  const unmatched = [];
  const usedAppIds = new Set();
  const usedItemIds = new Set();

  // Phase 1: exact steam_app_id binding
  for (const sg of steamGames) {
    for (const item of existingItems) {
      if (item.steam_app_id === sg.appid && !usedItemIds.has(item.fb_id)) {
        matched.set(item.fb_id, {app_id: sg.appid, playtime_minutes: sg.playtime_forever});
        usedAppIds.add(sg.appid);
        usedItemIds.add(item.fb_id);
        break;
      }
    }
  }

  // Phase 2-5: fuzzy name matching
  for (const sg of steamGames) {
    if (usedAppIds.has(sg.appid)) continue;
    const steamNorm = normalizeName(sg.name);
    let bestMatch = null;
    let bestPriority = Infinity;

    for (const item of existingItems) {
      if (usedItemIds.has(item.fb_id)) continue;
      const itemNorm = normalizeName(item.name);

      // Exact name
      if (sg.name.toLowerCase().trim() === item.name.toLowerCase().trim()) {
        bestMatch = item; bestPriority = 0; break;
      }

      // Normalized name
      if (steamNorm === itemNorm && steamNorm.length > 0) {
        if (bestPriority > 1) { bestMatch = item; bestPriority = 1; }
        continue;
      }

      // Substring containment
      if (steamNorm.length >= 4 && itemNorm.length >= 4 &&
          (steamNorm.includes(itemNorm) || itemNorm.includes(steamNorm))) {
        if (bestPriority > 2) { bestMatch = item; bestPriority = 2; }
        continue;
      }

      // Levenshtein
      if (steamNorm.length >= 4 && itemNorm.length >= 4) {
        const dist = levenshtein(steamNorm, itemNorm);
        const lenDiff = Math.abs(steamNorm.length - itemNorm.length);
        if (dist <= 2 && lenDiff <= 3) {
          if (bestPriority > 3) { bestMatch = item; bestPriority = 3; }
        }
      }
    }

    if (bestMatch) {
      matched.set(bestMatch.fb_id, {app_id: sg.appid, playtime_minutes: sg.playtime_forever});
      usedAppIds.add(sg.appid);
      usedItemIds.add(bestMatch.fb_id);
    } else {
      unmatched.push({app_id: sg.appid, name: sg.name, playtime_hours: Math.round(sg.playtime_forever / 60 * 100) / 100});
    }
  }

  return {matched, unmatched};
}

async function fetchGameAchievements(apiKey, appId) {
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${STEAM_ID}&appid=${appId}&format=json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const stats = data?.playerstats;
  if (!stats || !stats.achievements || stats.achievements.length === 0) return null;
  return stats.achievements;
}

/**
 * Run async tasks with a concurrency limit.
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function(item) => result
 * @param {number} concurrency - Max parallel tasks
 * @returns {Promise<Array>} - Results in same order as items
 */
async function parallelLimit(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        results[i] = {error: err};
      }
    }
  }

  const workers = Array.from({length: Math.min(concurrency, items.length)}, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchOwnedSteamGames(apiKey) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Steam API 返回错误 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const steamGames = data?.response?.games;

  if (!steamGames || steamGames.length === 0) {
    throw new Error("Steam个人资料为私密状态或无游戏数据。请在Steam设置中将游戏详情设为公开。");
  }
  return steamGames.map((game) => ({
    appid: Number(game.appid),
    name: game.name || String(game.appid),
    playtime_forever: Math.max(0, Math.floor(Number(game.playtime_forever) || 0)),
  }));
}

const makeRunId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function claimSteamPlaytimeLock(db, runId) {
  const lockRef = db.doc("metadata/steamPlaytimeLock");
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  return db.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(lockRef);
    const lock = lockSnap.exists ? lockSnap.data() : null;
    const expiresMillis = typeof lock?.expiresAt?.toMillis === "function"
      ? lock.expiresAt.toMillis()
      : Number(lock?.expiresAt || 0);
    if (expiresMillis > now.toMillis()) return false;
    transaction.set(lockRef, {runId, startedAt: now, expiresAt});
    return true;
  });
}

async function releaseSteamPlaytimeLock(db, runId) {
  const lockRef = db.doc("metadata/steamPlaytimeLock");
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(lockRef);
    if (snap.exists && snap.data()?.runId === runId) transaction.delete(lockRef);
  });
}

async function commitBatchOperations(db, operations) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    operations.slice(i, i + BATCH_LIMIT).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

async function collectSteamPlaytimeSnapshot(apiKey, trigger = "manual", steamGames = null) {
  const db = admin.firestore();
  const runId = makeRunId();
  const acquired = await claimSteamPlaytimeLock(db, runId);
  if (!acquired) return {skipped: "already-running"};

  const trackingRef = db.doc("metadata/steamPlaytimeTracking");
  const observedAt = admin.firestore.Timestamp.now();
  try {
    const games = steamGames || await fetchOwnedSteamGames(apiKey);
    const trackingSnap = await trackingRef.get();
    const tracking = trackingSnap.exists ? trackingSnap.data() : {};
    const trackingInitialized = Boolean(tracking.initializedAt);
    const stateRefs = new Map();
    const stateDocs = await Promise.all(games.map((game) => db.doc(`steamPlaytimeState/${game.appid}`).get()));
    stateDocs.forEach((snap) => { if (snap.exists) stateRefs.set(snap.id, snap.data()); });
    const changes = buildSnapshotChanges({games, states: stateRefs, trackingInitialized, observedAt});
    const operations = [];

    changes.stateChanges.forEach((state) => {
      operations.push((batch) => batch.set(db.doc(`steamPlaytimeState/${state.appId}`), state));
    });

    if (trackingInitialized && changes.month && Object.keys(changes.monthDeltas).length > 0) {
      const monthRef = db.doc(`steamPlaytimeMonths/${changes.month}`);
      const monthSnap = await monthRef.get();
      const existingMonth = monthSnap.exists ? monthSnap.data() : {};
      const minutesByApp = {...(existingMonth.minutesByApp || {})};
      if (!existingMonth.minutesByApp && monthSnap.exists) {
        const appSnapshot = await monthRef.collection("apps").get();
        appSnapshot.docs.forEach((appDoc) => {
          minutesByApp[appDoc.id] = Number(appDoc.data()?.minutes || 0);
        });
      }
      Object.entries(changes.monthDeltas).forEach(([appId, minutes]) => {
        minutesByApp[appId] = (minutesByApp[appId] || 0) + minutes;
      });
      const serializedSize = Buffer.byteLength(JSON.stringify(minutesByApp), "utf8");
      if (serializedSize < 750 * 1024) {
        const trackedTotalMinutes = Object.values(minutesByApp).reduce((sum, value) => sum + Number(value || 0), 0);
        operations.push((batch) => batch.set(monthRef, {
          month: changes.month,
          minutesByApp,
          trackedTotalMinutes,
          firstObservedAt: existingMonth.firstObservedAt || observedAt,
          lastObservedAt: observedAt,
          updatedAt: observedAt,
        }, {merge: true}));
      } else {
        logger.warn(`Steam month ${changes.month} is near Firestore size limit; using app subcollection`);
        const existingAppIds = Object.keys(minutesByApp);
        const trackedTotalMinutes = existingAppIds.reduce((sum, appId) => sum + Number(minutesByApp[appId] || 0), 0);
        operations.push((batch) => batch.set(monthRef, {
          month: changes.month,
          minutesByApp: admin.firestore.FieldValue.delete(),
          trackedTotalMinutes,
          firstObservedAt: existingMonth.firstObservedAt || observedAt,
          lastObservedAt: observedAt,
          updatedAt: observedAt,
        }, {merge: true}));
        existingAppIds.forEach((appId) => {
          operations.push((batch) => batch.set(db.doc(`steamPlaytimeMonths/${changes.month}/apps/${appId}`), {
            appId: Number(appId),
            minutes: minutesByApp[appId],
            updatedAt: observedAt,
          }, {merge: true}));
        });
      }
    }

    const metadata = {
      schemaVersion: 1,
      lastCompletedAt: observedAt,
      lastRunId: runId,
      coverage: trackingInitialized ? "active" : "partial-first-month",
      lastError: changes.anomalies.length ? `${changes.anomalies.length} Steam累计时长下降异常` : null,
      lastTrigger: trigger,
    };
    if (!trackingInitialized) metadata.initializedAt = observedAt;
    operations.push((batch) => batch.set(trackingRef, metadata, {merge: true}));
    await commitBatchOperations(db, operations);
    changes.anomalies.forEach((anomaly) => logger.warn("Steam playtime counter decreased", anomaly));
    return {
      runId,
      baseline: !trackingInitialized,
      sampledGames: games.length,
      month: changes.month,
      trackedMinutes: Object.values(changes.monthDeltas).reduce((sum, value) => sum + value, 0),
      anomalies: changes.anomalies.length,
    };
  } catch (error) {
    await trackingRef.set({schemaVersion: 1, lastError: error.message, lastRunId: runId}, {merge: true}).catch(() => {});
    throw error;
  } finally {
    await releaseSteamPlaytimeLock(db, runId).catch((error) => logger.warn("Failed to release Steam playtime lock", error));
  }
}

async function syncSteamItemsAndAchievements(apiKey, steamGames) {
  const db = admin.firestore();

  logger.info(`Steam API returned ${steamGames.length} games`);

  // 2. Read all items from Firestore
  const snapshot = await db.collection("items").get();
  const existingItems = snapshot.docs.map(doc => ({fb_id: doc.id, ...doc.data()}));

  // 3. Fuzzy match
  const {matched, unmatched} = fuzzyMatch(steamGames, existingItems);

  // 4. Fetch achievement data concurrently (with rate limit)
  //    Steam Web API allows ~100 requests per minute; use concurrency=5 to stay safe
  const entries = [...matched.entries()];
  const achievementResults = await parallelLimit(
    entries.map(([fbId, info]) => ({fbId, info})),
    async ({fbId, info}) => {
      try {
        const achievements = await fetchGameAchievements(apiKey, info.app_id);
        return {fbId, achievements};
      } catch (err) {
        logger.warn(`Achievement fetch failed for appid ${info.app_id}: ${err.message}`);
        return {fbId, achievements: null, error: err.message};
      }
    },
    5 // concurrency limit — 5 parallel requests to avoid Steam API rate limits
  );

  // Build a lookup map: fbId => achievement result
  const achievementMap = new Map();
  for (const r of achievementResults) {
    achievementMap.set(r.fbId, r.achievements);
  }

  // 5. Batch update matched items (now with pre-fetched achievement data)
  let updated = 0;
  let achievementsChecked = 0;
  let fullyCompletedCount = 0;
  const BATCH_LIMIT = 400;

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + BATCH_LIMIT);

    for (const [fbId, info] of chunk) {
      const item = existingItems.find(it => it.fb_id === fbId);
      const steamPlaytimeHours = Math.round(info.playtime_minutes / 60 * 100) / 100;
      const updateData = {
        steam_app_id: info.app_id,
        steam_last_sync: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Only update playTime if override is enabled and Steam value is greater
      if (item.steam_override !== false && steamPlaytimeHours > (item.playTime || 0)) {
        updateData.playTime = steamPlaytimeHours;
        updated++;
      }

      // Apply pre-fetched achievement data
      const achievements = achievementMap.get(fbId);
      if (achievements !== null && achievements !== undefined) {
        achievementsChecked++;
        const allAchieved = achievements.length > 0 && achievements.every(a => a.achieved === 1);
        updateData.fullyCompleted = allAchieved;
        if (allAchieved) fullyCompletedCount++;
      }

      batch.set(db.doc(`items/${fbId}`), updateData, {merge: true});
    }

    await batch.commit();
  }

  // 6. Write sync metadata
  const unmatchedTop = unmatched.slice(0, 50);
  await db.doc("metadata/steamSync").set({
    lastSyncTime: admin.firestore.FieldValue.serverTimestamp(),
    matchedCount: matched.size,
    unmatchedCount: unmatched.length,
    unmatchedGames: unmatchedTop,
    achievementsChecked: achievementsChecked,
    fullyCompletedCount: fullyCompletedCount,
  }, {merge: true});

  logger.info(`Steam sync complete: matched=${matched.size}, updated=${updated}, unmatched=${unmatched.length}, achievements=${achievementsChecked}, fullyCompleted=${fullyCompletedCount}`);

  return {matched: matched.size, updated, unmatched: unmatchedTop, achievementsChecked, fullyCompletedCount};
}

async function performSteamSync(apiKey, trigger = "manual") {
  const steamGames = await fetchOwnedSteamGames(apiKey);
  const playtime = await collectSteamPlaytimeSnapshot(apiKey, trigger, steamGames);
  if (playtime.skipped) return playtime;
  const items = await syncSteamItemsAndAchievements(apiKey, steamGames);
  return {...items, playtime};
}

exports.syncSteamData = onCall({
  secrets: [STEAM_API_KEY],
  timeoutSeconds: 300,
  maxInstances: 1,
  concurrency: 1,
  enforceAppCheck: true,
  consumeAppCheckToken: true,
}, async (request) => {
  // Admin-only access
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "只有管理员才能同步Steam数据。");
  }
  await claimFunctionQuota("steamSync", request.auth.uid);

  const apiKey = STEAM_API_KEY.value();
  if (!apiKey) {
    logger.error("STEAM_API_KEY secret is not set");
    return {error: "STEAM_API_KEY 未配置。请在 Firebase 中设置此密钥: firebase functions:secrets:set STEAM_API_KEY"};
  }

  try {
    const result = await performSteamSync(apiKey, "manual");
    return result;
  } catch (error) {
    logger.error("Error calling syncSteamData:", error.message, error.stack);
    return {error: `Steam同步失败: ${error.message}`};
  }
});

exports.scheduledSteamSync = onSchedule(
    {
      schedule: "0 4 * * *",
      timeZone: "Asia/Shanghai",
      secrets: [STEAM_API_KEY],
      timeoutSeconds: 300,
      maxInstances: 1,
      concurrency: 1,
    },
    async () => {
      const apiKey = STEAM_API_KEY.value();
      if (!apiKey) {
        logger.error("STEAM_API_KEY secret is not set");
        return;
      }
      try {
        await performSteamSync(apiKey, "scheduled");
      } catch (error) {
        logger.error("Scheduled Steam sync failed:", error.message);
      }
    },
);
