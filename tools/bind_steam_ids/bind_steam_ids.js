#!/usr/bin/env node
/**
 * bind_steam_ids.js — Bind Steam App IDs to existing Firestore game items.
 *
 * This is a one-off migration helper. Its input is a local JSON file
 * (default tools/bind_steam_ids/bindings.json, gitignored) rather than a
 * hardcoded table, so personal library data never enters the repository:
 *
 *   {
 *     "bindings":     [ [ "<fb_id>", "中文名", 220, "Half-Life 2" ] ],
 *     "unmatchedSteam": [ [ 320, "Half-Life 2: Deathmatch" ] ],
 *     "unboundItems": [ [ "<fb_id>", "v-0001", "中文名", "reason" ] ]
 *   }
 *
 * Copy bindings.example.json to bindings.json to start. Only `bindings` is
 * written; the other two arrays are printed for reference.
 *
 * Usage:
 *   node tools/bind_steam_ids/bind_steam_ids.js                    # dry run (default)
 *   node tools/bind_steam_ids/bind_steam_ids.js --data my.json
 *   node tools/bind_steam_ids/bind_steam_ids.js --apply            # LIVE writes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_BINDINGS = 500;

// Opt-in to writes. A bare invocation previews — this matches
// tools/create_items/ and tools/update_unsold_physical_estimates/.
const DRY_RUN = !process.argv.includes('--apply');

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0) {
    const value = process.argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个文件路径`);
    return value;
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

const DATA_PATH = path.resolve(argValue('--data', path.join(__dirname, 'bindings.json')));

// ── Data loading ────────────────────────────────────────────────────────────

function asArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`);
  return value;
}

function loadBindings() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(
      `找不到 ${DATA_PATH}\n` +
      '把 tools/bind_steam_ids/bindings.example.json 复制为 bindings.json 后填写；' +
      '真实绑定表含个人游戏库数据，已被 .gitignore 忽略。'
    );
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`${DATA_PATH} 不是合法 JSON: ${err.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('bindings.json 顶层必须是对象');
  }

  const bindings = asArray(data.bindings, 'bindings');
  if (bindings.length > MAX_BINDINGS) throw new Error(`bindings 超过 ${MAX_BINDINGS} 条`);
  const seen = new Set();
  bindings.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length < 3) {
      throw new Error(`bindings[${index}] 应为 [fb_id, 中文名, appId] 或带英文名的四元组`);
    }
    const [fbId, , appId] = entry;
    if (typeof fbId !== 'string' || !/^[A-Za-z0-9_-]{10,}$/.test(fbId)) {
      throw new Error(`bindings[${index}] fb_id 非法`);
    }
    if (!Number.isInteger(Number(appId)) || Number(appId) <= 0) {
      throw new Error(`bindings[${index}] appId 必须是正整数`);
    }
    if (seen.has(fbId)) throw new Error(`bindings 中 fb_id 重复: ${fbId}`);
    seen.add(fbId);
  });

  return {
    bindings,
    unmatchedSteam: asArray(data.unmatchedSteam, 'unmatchedSteam'),
    unboundItems: asArray(data.unboundItems, 'unboundItems'),
  };
}

// ── Token ───────────────────────────────────────────────────────────────────

function loadAccessToken() {
  const configPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    '.config', 'configstore', 'firebase-tools.json'
  );
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(raw);
  if (!cfg.tokens || !cfg.tokens.access_token) {
    throw new Error('No access_token found in firebase-tools.json');
  }
  return cfg.tokens.access_token;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Firestore REST helpers ──────────────────────────────────────────────────

async function patchSteamAppId(fbId, steamAppId, accessToken) {
  const url =
    `${FIRESTORE_BASE}/items/${fbId}?updateMask.fieldPaths=steam_app_id`;

  const body = JSON.stringify({
    fields: {
      steam_app_id: { integerValue: String(steamAppId) },
    },
  });

  return httpsRequest(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, body);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Steam App ID Binding Script ===\n');

  if (DRY_RUN) {
    console.log('[DRY RUN] No Firestore writes will be made.\n');
  }

  const { bindings, unmatchedSteam, unboundItems } = loadBindings();
  console.log(`Bindings file: ${DATA_PATH}\n`);

  const accessToken = loadAccessToken();
  console.log('Firebase access token loaded.\n');

  // ── Print bindings ────────────────────────────────────────────────────────

  console.log(`Confirmed bindings: ${bindings.length}\n`);
  for (let i = 0; i < bindings.length; i++) {
    const [fbId, cnName, appId, enName] = bindings[i];
    console.log(`  ${String(i + 1).padStart(2)}. [${appId}] ${cnName}  -->  ${enName || ''}`);
    console.log(`      fb_id: ${fbId}`);
  }

  // ── Write to Firestore ────────────────────────────────────────────────────

  console.log('\n--- Updating Firestore ---\n');

  let successCount = 0;
  let failCount = 0;

  for (const [fbId, cnName, appId, enName] of bindings) {
    const label = `${cnName}  -->  ${enName || ''} (${appId})`;

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would bind: ${fbId} | ${label}`);
      successCount++;
      continue;
    }

    try {
      await patchSteamAppId(fbId, Number(appId), accessToken);
      console.log(`  [OK] ${fbId} | ${label}`);
      successCount++;
    } catch (err) {
      console.error(`  [FAIL] ${fbId} | ${label}`);
      console.error(`         ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Bound:   ${successCount}`);
  if (failCount > 0) console.log(`Failed:  ${failCount}`);

  // ── Reference lists (not written) ──────────────────────────────────────────

  console.log(`\nUnmatched Steam games (no existing item): ${unmatchedSteam.length}`);
  for (const [id, name] of unmatchedSteam) {
    console.log(`  [${id}] ${name}`);
  }

  console.log(`\nExisting items still without steam_app_id: ${unboundItems.length}`);
  for (const [fbId, itemId, cnName, reason] of unboundItems) {
    console.log(`  ${fbId} | ${itemId} | ${cnName} | ${reason}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
