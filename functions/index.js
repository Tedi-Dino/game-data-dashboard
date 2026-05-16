// functions/index.js — Firebase Cloud Function
// Calls DeepSeek API for AI game recommendations

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

admin.initializeApp();

// Define secrets
const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");
const STEAM_API_KEY = defineSecret("STEAM_API_KEY");

const STEAM_ID = "76561199530798696";

// Admin UIDs — must match js/config/constants.js
const ADMIN_UIDS = ["ZPyHfPGUI4elNvRN2Q30ZqfzT6X2"];

exports.getAiRecommendations = onCall({secrets: [deepseekApiKey], timeoutSeconds: 300}, async (request) => {
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
            response_format: { type: "json_object" },
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
      return { output: { text: "" }, error: "DeepSeek API 返回了空响应。" };
    }

    logger.info("DeepSeek response received, length:", textContent.length);

    // With response_format json_object, content is guaranteed valid JSON
    try {
      const parsed = JSON.parse(textContent);
      const arr = Array.isArray(parsed) ? parsed : parsed.recommendations || parsed.data || [];
      if (Array.isArray(arr) && arr.every(r => r.name && r.reason)) {
        return { recommendations: arr };
      }
      logger.warn("JSON structure mismatch:", textContent);
      return { output: { text: "" }, error: "AI返回的JSON结构不符合预期。" };
    } catch (parseErr) {
      logger.error("Failed to parse JSON response:", parseErr.message, textContent);
      return { output: { text: "" }, error: "AI返回的格式不正确，无法解析推荐内容。" };
    }

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

async function performSteamSync(apiKey) {
  // 1. Fetch owned games from Steam
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

  logger.info(`Steam API returned ${steamGames.length} games`);

  // 2. Read all items from Firestore
  const db = admin.firestore();
  const snapshot = await db.collection("items").get();
  const existingItems = snapshot.docs.map(doc => ({fb_id: doc.id, ...doc.data()}));

  // 3. Fuzzy match
  const {matched, unmatched} = fuzzyMatch(steamGames, existingItems);

  // 4. Batch update matched items
  let updated = 0;
  let achievementsChecked = 0;
  let fullyCompletedCount = 0;
  const BATCH_LIMIT = 400;
  const entries = [...matched.entries()];

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

      // Fetch achievement data
      try {
        const achievements = await fetchGameAchievements(apiKey, info.app_id);
        if (achievements !== null) {
          achievementsChecked++;
          const allAchieved = achievements.length > 0 && achievements.every(a => a.achieved === 1);
          updateData.fullyCompleted = allAchieved;
          if (allAchieved) fullyCompletedCount++;
        }
      } catch (err) {
        logger.warn(`Achievement fetch failed for appid ${info.app_id}: ${err.message}`);
      }

      batch.set(db.doc(`items/${fbId}`), updateData, {merge: true});
    }

    await batch.commit();
  }

  // 5. Write sync metadata
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

exports.syncSteamData = onCall({secrets: [STEAM_API_KEY], timeoutSeconds: 300}, async (request) => {
  // Admin-only access
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "只有管理员才能同步Steam数据。");
  }

  const apiKey = STEAM_API_KEY.value();
  if (!apiKey) {
    logger.error("STEAM_API_KEY secret is not set");
    return {error: "STEAM_API_KEY 未配置。请在 Firebase 中设置此密钥: firebase functions:secrets:set STEAM_API_KEY"};
  }

  try {
    const result = await performSteamSync(apiKey);
    return result;
  } catch (error) {
    logger.error("Error calling syncSteamData:", error.message, error.stack);
    return {error: `Steam同步失败: ${error.message}`};
  }
});

exports.scheduledSteamSync = onSchedule(
    {schedule: "0 4 * * *", timeZone: "Asia/Shanghai", secrets: [STEAM_API_KEY], timeoutSeconds: 300},
    async () => {
      const apiKey = STEAM_API_KEY.value();
      if (!apiKey) {
        logger.error("STEAM_API_KEY secret is not set");
        return;
      }
      try {
        await performSteamSync(apiKey);
      } catch (error) {
        logger.error("Scheduled Steam sync failed:", error.message);
      }
    },
);
