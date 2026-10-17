// functions/steam-sync-core.js — Steam matching logic shared by BOTH sync paths.
//
// The Cloud Function (`syncSteamData`) and the Spark-plan local runner
// (`tools/steam_sync/sync.mjs`) must agree on which Steam app maps to which
// dashboard row, or the two paths would write different playtimes depending on
// who ran last. Keeping this module dependency-free is deliberate: the local
// runner loads it with `createRequire` and never touches firebase-admin.
//
// CommonJS because functions/ runs on the Node runtime without a bundler.

const { shouldUseSteamPlaytime, canLinkSteamItem } = require("./steam-playtime.js");

// Items whose playTime may be overwritten by Steam. Requires an actual Steam
// platform item: a stale steam_app_id surviving a platform change (saveItem uses
// merge:true) must not keep pulling Steam minutes into a manually entered value.
const canReceiveSteamPlaytime = (item) => canLinkSteamItem(item) && item.type === "steam";

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

  for (const sg of steamGames) {
    for (const item of existingItems) {
      if (item.steam_app_id === sg.appid && shouldUseSteamPlaytime(item) &&
          canReceiveSteamPlaytime(item) && !usedItemIds.has(item.fb_id)) {
        matched.set(item.fb_id, {app_id: sg.appid, playtime_minutes: sg.playtime_forever});
        usedAppIds.add(sg.appid);
        usedItemIds.add(item.fb_id);
        break;
      }
    }
  }

  // Phase 2-5: fuzzy name matching
  // Normalize every candidate name once instead of re-normalizing it inside the
  // O(steamGames x items) loop below.
  const candidates = existingItems.map((item) => ({item, norm: normalizeName(item.name), lower: item.name.toLowerCase().trim()}));

  for (const sg of steamGames) {
    if (usedAppIds.has(sg.appid)) continue;
    const steamNorm = normalizeName(sg.name);
    let bestMatch = null;
    let bestPriority = Infinity;

    for (const {item, norm: itemNorm, lower} of candidates) {
      if (usedItemIds.has(item.fb_id)) continue;

      // Exact name
      if (sg.name.toLowerCase().trim() === lower) {
        bestMatch = item; bestPriority = 0; break;
      }

      // Normalized name
      if (steamNorm === itemNorm && steamNorm.length > 0) {
        if (bestPriority > 1) { bestMatch = item; bestPriority = 1; }
        continue;
      }

      // Levenshtein is unreachable when the length difference already exceeds the
      // acceptance threshold below — skip building the DP table entirely.
      const lenDiff = Math.abs(steamNorm.length - itemNorm.length);

      // Substring containment
      if (steamNorm.length >= 4 && itemNorm.length >= 4 &&
          (steamNorm.includes(itemNorm) || itemNorm.includes(steamNorm))) {
        if (bestPriority > 2) { bestMatch = item; bestPriority = 2; }
        continue;
      }

      // Levenshtein
      if (steamNorm.length >= 4 && itemNorm.length >= 4 && lenDiff <= 3) {
        const dist = levenshtein(steamNorm, itemNorm);
        if (dist <= 2) {
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

module.exports = {
  canLinkSteamItem,
  canReceiveSteamPlaytime,
  normalizeName,
  levenshtein,
  fuzzyMatch,
};
