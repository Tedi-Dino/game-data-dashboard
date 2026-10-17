#!/usr/bin/env node
/**
 * tools/steam_sync/sync.mjs — Steam sync for the Firebase Spark (free) plan.
 *
 * Spark cannot deploy Cloud Functions or Cloud Scheduler, so `scheduledSteamSync`
 * is gone. This script does the same work from the local machine, writing
 * through the Firestore REST API with the Firebase CLI's OAuth token (the same
 * credential tools/create_items and tools/bind_steam_ids already use — no
 * service-account key needed).
 *
 * It reuses functions/steam-playtime.js and functions/steam-sync-core.js, so the
 * delta maths and the name matching are literally the same code as the Cloud
 * Function; only the transport differs.
 *
 * Usage:
 *   node tools/steam_sync/sync.mjs                     # dry run (default)
 *   node tools/steam_sync/sync.mjs --apply             # write to Firestore
 *   node tools/steam_sync/sync.mjs --games-file f.json # offline: skip Steam API
 *   node tools/steam_sync/sync.mjs --no-achievements   # skip the achievement pass
 *
 * Credentials:
 *   STEAM_API_KEY  — env var, or a line `STEAM_API_KEY=...` in
 *                    tools/steam_sync/.env (the repo already ignores .env files).
 *                    Get one at https://steamcommunity.com/dev/apikey
 *
 * Network: honours HTTPS_PROXY (Clash et al.) for both Firestore and Steam,
 * because firestore.googleapis.com is not directly reachable in some networks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
    buildItemUpdates,
    buildSyncMetadata,
    buildTrackingMetadata,
    canLinkSteamItem,
    fuzzyMatch,
    mergeMonthDeltas,
    toStateDocuments,
} from './lib.mjs';
import {
    commitWrites,
    getDocument,
    listDocuments,
    loadAccessToken,
    request,
    withTokenRefresh,
} from './firestore.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { buildSnapshotChanges } = require(path.join(repoRoot, 'functions/steam-playtime.js'));

// Must match functions/index.js. tools/tests/free-tier.test.mjs asserts it.
const STEAM_ID = '76561199530798696';

const APPLY = process.argv.includes('--apply');
const SKIP_ACHIEVEMENTS = process.argv.includes('--no-achievements');
const gamesFileArg = (() => {
    const i = process.argv.indexOf('--games-file');
    return i >= 0 ? process.argv[i + 1] : null;
})();

const log = (...args) => console.log(...args);

// ── Local .env ──────────────────────────────────────────────────────────────

function loadDotEnv() {
    const file = path.join(repoRoot, 'tools/steam_sync/.env');
    if (!fs.existsSync(file)) return {};
    const out = {};
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
    return out;
}

// ── Steam Web API ───────────────────────────────────────────────────────────

async function fetchOwnedGames(apiKey) {
    const url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/' +
        `?key=${encodeURIComponent(apiKey)}&steamid=${STEAM_ID}` +
        '&include_appinfo=1&include_played_free_games=1&format=json';
    const res = await request(url);
    if (res.status !== 200) {
        throw new Error(`Steam API 返回错误 (${res.status}): ${res.body.slice(0, 200)}`);
    }
    const games = JSON.parse(res.body)?.response?.games;
    if (!Array.isArray(games) || games.length === 0) {
        throw new Error('Steam 个人资料为私密状态或无游戏数据。请在 Steam 设置中将游戏详情设为公开。');
    }
    return games.map((game) => ({
        appid: Number(game.appid),
        name: game.name || String(game.appid),
        playtime_forever: Math.max(0, Math.floor(Number(game.playtime_forever) || 0)),
    }));
}

async function fetchAchievements(apiKey, appId) {
    const url = 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/' +
        `?key=${encodeURIComponent(apiKey)}&steamid=${STEAM_ID}&appid=${appId}&format=json`;
    const res = await request(url);
    if (res.status !== 200) return null;
    const stats = JSON.parse(res.body)?.playerstats;
    if (!stats || !Array.isArray(stats.achievements) || stats.achievements.length === 0) return null;
    return stats.achievements;
}

async function parallelLimit(items, fn, concurrency = 5) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            try {
                results[i] = await fn(items[i]);
            } catch (err) {
                results[i] = { error: err };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

// ── Offline fixture ─────────────────────────────────────────────────────────

function readGamesFile(file) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const games = Array.isArray(json) ? json : json.games;
    if (!Array.isArray(games)) throw new Error('games 文件格式应为 { "games": [...] } 或数组');
    return games.map((g) => ({
        appid: Number(g.appid),
        name: g.name || String(g.appid),
        playtime_forever: Math.max(0, Math.floor(Number(g.playtime_forever) || 0)),
    }));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    log('=== Steam 同步（Spark 本地版）===\n');
    if (!APPLY) log('[DRY RUN] 不会写入 Firestore，加 --apply 才真正写库。\n');

    const dotEnv = loadDotEnv();
    const apiKey = process.env.STEAM_API_KEY || dotEnv.STEAM_API_KEY || '';
    if (!gamesFileArg && !apiKey) {
        throw new Error('缺少 STEAM_API_KEY（环境变量或 tools/steam_sync/.env）。' +
            '也可用 --games-file 指定本地 Steam 数据做离线演练。');
    }

    const auth = loadAccessToken();
    const tokenRef = { token: auth.accessToken };
    log('Firebase access token loaded.');

    const observedAt = new Date();
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // 1. Steam library
    const steamGames = gamesFileArg
        ? readGamesFile(gamesFileArg)
        : await withTokenRefresh(auth, tokenRef, () => fetchOwnedGames(apiKey));
    log(`Steam 游戏: ${steamGames.length} 款${gamesFileArg ? '（来自本地文件）' : ''}`);

    // 2. Dashboard rows
    const itemDocs = await withTokenRefresh(auth, tokenRef, (t) => listDocuments('items', t));
    const allItems = itemDocs.map((d) => ({ fb_id: d.id, ...d.data }));
    const linkable = allItems.filter(canLinkSteamItem);

    const { matched, unmatched } = fuzzyMatch(steamGames, linkable);
    log(`匹配: ${matched.size} 款，未匹配: ${unmatched.length} 款`);

    // 3. Achievements
    const achievementsByApp = new Map();
    if (!SKIP_ACHIEVEMENTS) {
        const entries = [...matched.values()];
        log(`拉取成就: ${entries.length} 个 app（并发 5）...`);
        const results = await parallelLimit(
            entries,
            async (info) => ({ app_id: info.app_id, achievements: await fetchAchievements(apiKey, info.app_id) }),
            5,
        );
        for (const r of results) {
            if (r && !r.error) achievementsByApp.set(r.app_id, r.achievements);
        }
    }

    // 4. Playtime snapshot inputs
    const tracking = await withTokenRefresh(
        auth, tokenRef, (t) => getDocument('metadata/steamPlaytimeTracking', t)
    );
    const trackingInitialized = Boolean(tracking?.initializedAt);
    const stateDocs = await withTokenRefresh(auth, tokenRef, (t) => listDocuments('steamPlaytimeState', t));
    const states = new Map(stateDocs.map((d) => [d.id, d.data]));

    const changes = buildSnapshotChanges({ games: steamGames, states, trackingInitialized, observedAt });
    log(`本月: ${changes.month} | 计时增量: ` +
        `${Object.values(changes.monthDeltas).reduce((s, v) => s + v, 0)} 分钟` +
        (changes.anomalies.length ? ` | 异常: ${changes.anomalies.length}` : ''));

    // 5. Build the write set
    const itemPlan = buildItemUpdates({ matched, allItems, achievementsByApp, observedAt });
    const writes = [];

    for (const { fbId, fields } of itemPlan.updates) {
        writes.push({ docPath: `items/${fbId}`, fields, mask: Object.keys(fields) });
    }
    for (const state of toStateDocuments(changes.stateChanges)) {
        writes.push({ docPath: `steamPlaytimeState/${state.docId}`, fields: state.fields });
    }

    if (trackingInitialized && changes.month && Object.keys(changes.monthDeltas).length > 0) {
        let existingMonth = await withTokenRefresh(
            auth, tokenRef, (t) => getDocument(`steamPlaytimeMonths/${changes.month}`, t)
        );
        if (existingMonth && !existingMonth.minutesByApp) {
            const apps = await withTokenRefresh(
                auth, tokenRef, (t) => listDocuments(`steamPlaytimeMonths/${changes.month}/apps`, t)
            );
            existingMonth = {
                ...existingMonth,
                minutesByApp: Object.fromEntries(apps.map((a) => [a.id, Number(a.data?.minutes || 0)])),
            };
        }
        const month = mergeMonthDeltas({
            monthDeltas: changes.monthDeltas,
            existingMonth,
            monthKey: changes.month,
            observedAt,
        });
        if (month.oversized) {
            throw new Error(`steamPlaytimeMonths/${changes.month} 已达 ${month.sizeBytes} 字节，` +
                '接近 Firestore 单文档上限。云函数会改用 apps 子集合，本地脚本不实现该路径，' +
                '请升级回 Blaze 或先归档旧月份。');
        }
        writes.push({
            docPath: `steamPlaytimeMonths/${changes.month}`,
            fields: month.fields,
            mask: Object.keys(month.fields),
        });
    }

    const trackingMeta = buildTrackingMetadata({
        trackingInitialized,
        anomalies: changes.anomalies,
        runId,
        observedAt,
    });
    writes.push({
        docPath: 'metadata/steamPlaytimeTracking',
        fields: trackingMeta,
        mask: Object.keys(trackingMeta),
    });

    const syncMeta = buildSyncMetadata({
        matched,
        unmatched,
        achievementsChecked: itemPlan.achievementsChecked,
        fullyCompletedCount: itemPlan.fullyCompletedCount,
        observedAt,
    });
    writes.push({
        docPath: 'metadata/steamSync',
        fields: syncMeta,
        mask: Object.keys(syncMeta),
    });

    // 6. Report
    log('');
    log(`时长更新: ${itemPlan.updated} 款 | 检查成就: ${itemPlan.achievementsChecked} 款 | ` +
        `全成就: ${itemPlan.fullyCompletedCount} 款`);
    if (unmatched.length) {
        log('');
        log(`未匹配（前 10 条，共 ${unmatched.length}）:`);
        for (const g of unmatched.slice(0, 10)) {
            log(`  [${g.app_id}] ${g.name} (${g.playtime_hours}h)`);
        }
    }
    log('');
    log(`待写入 ${writes.length} 个文档。`);

    if (!APPLY) {
        log('\nDry run 结束。确认无误后加 --apply 写库。');
        return;
    }

    const written = await withTokenRefresh(auth, tokenRef, (t) => commitWrites(writes, t));
    log(`\n✅ 已写入 ${written} 个文档，lastSyncTime = ${observedAt.toISOString()}`);
}

main().catch((err) => {
    console.error('\nFatal:', err.message || err);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
});
