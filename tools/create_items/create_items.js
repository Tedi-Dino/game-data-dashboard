#!/usr/bin/env node
/**
 * create_items.js — Apply one batch of `items` changes to Firestore.
 *
 * The batch is data, not code: pass a JSON file (default
 * tools/create_items/batch.json, which is gitignored) with this shape:
 *
 *   {
 *     "newItems": [ { "id": "x-0001", "name": "...", "type": "xbox", ... } ],
 *     "updates":  [ { "fb_id": "<firestore doc id>",
 *                     "fields": { "rating": 8, "passDate": "2026-09-28" } } ]
 *   }
 *
 * Copy batch.example.json to batch.json to start. Keep real batches local —
 * they contain personal purchase data and must not be committed.
 *
 * Behaviour:
 *   - POSTs every entry of `newItems` as a new document (Firestore auto-generates
 *     the document id), and
 *   - PATCHes every entry of `updates` onto an EXISTING document using an
 *     updateMask, so only the listed fields are touched (merge semantics).
 * Finally it bumps `metadata/dashboard.lastManualUpdate` so the dashboard header
 * reflects the change.
 *
 * Reconciling a reported event against the live collection (new record vs.
 * completing an existing one) is the caller's job — dump `items` with
 * tools/dump_items first.
 *
 * Field values are plain JS/JSON: string -> stringValue, integer -> integerValue,
 * non-integer number -> doubleValue, boolean -> booleanValue. `undefined`/null
 * fields are omitted instead of being written as nullValue.
 *
 * Usage:
 *   node tools/create_items/create_items.js                    # dry run (default)
 *   node tools/create_items/create_items.js --data my-batch.json
 *   node tools/create_items/create_items.js --apply            # LIVE writes
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_NEW_ITEMS = 500;
const MAX_UPDATES = 500;

// Opt-in to writes. Running with no arguments is a preview — matches
// tools/bind_steam_ids/ and tools/update_unsold_physical_estimates/.
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

const DATA_PATH = path.resolve(argValue('--data', path.join(__dirname, 'batch.json')));

// ── Batch loading & validation ──────────────────────────────────────────────

function fail(message) {
  throw new Error(`${path.basename(DATA_PATH)}: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateFieldValue(value, where) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (value.length > 10000) fail(`${where} 字符串过长（>10000 字符）`);
    return;
  }
  if (typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${where} 不是有限数字`);
    return;
  }
  fail(`${where} 类型不支持（只允许 string/number/boolean/null）`);
}

function validateBatch(data) {
  if (!isPlainObject(data)) fail('顶层必须是 JSON 对象');

  const newItems = data.newItems ?? data.NEW_ITEMS ?? [];
  const updates = data.updates ?? data.UPDATES ?? [];
  if (!Array.isArray(newItems)) fail('newItems 必须是数组');
  if (!Array.isArray(updates)) fail('updates 必须是数组');
  if (newItems.length > MAX_NEW_ITEMS) fail(`newItems 超过 ${MAX_NEW_ITEMS} 条`);
  if (updates.length > MAX_UPDATES) fail(`updates 超过 ${MAX_UPDATES} 条`);
  if (newItems.length + updates.length === 0) fail('批次为空：没有 newItems 或 updates');

  const seenIds = new Set();
  newItems.forEach((item, index) => {
    const where = `newItems[${index}]`;
    if (!isPlainObject(item)) fail(`${where} 必须是对象`);
    for (const key of ['id', 'name', 'type']) {
      if (typeof item[key] !== 'string' || !item[key].trim()) {
        fail(`${where}.${key} 必填且必须是非空字符串`);
      }
    }
    if (seenIds.has(item.id)) fail(`${where}.id "${item.id}" 在批次内重复`);
    seenIds.add(item.id);
    if ('fb_id' in item) fail(`${where} 不应包含 fb_id（新建文档由 Firestore 生成 id）`);
    for (const [key, value] of Object.entries(item)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`${where} 字段名非法: ${key}`);
      validateFieldValue(value, `${where}.${key}`);
    }
  });

  updates.forEach((update, index) => {
    const where = `updates[${index}]`;
    if (!isPlainObject(update)) fail(`${where} 必须是对象`);
    if (typeof update.fb_id !== 'string' || !update.fb_id.trim()) {
      fail(`${where}.fb_id 必填且必须是非空字符串`);
    }
    if (!isPlainObject(update.fields) || Object.keys(update.fields).length === 0) {
      fail(`${where}.fields 必须是非空对象`);
    }
    for (const [key, value] of Object.entries(update.fields)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`${where} 字段名非法: ${key}`);
      validateFieldValue(value, `${where}.${key}`);
    }
  });

  return { newItems, updates };
}

function loadBatch() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(
      `找不到批次文件 ${DATA_PATH}\n` +
      '把 tools/create_items/batch.example.json 复制为 batch.json 后填写；' +
      '真实批次含个人数据，已被 .gitignore 忽略。'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`${DATA_PATH} 不是合法 JSON: ${err.message}`);
  }
  return validateBatch(parsed);
}

// ── Token ───────────────────────────────────────────────────────────────────

function loadAccessToken() {
  const configPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    '.config', 'configstore', 'firebase-tools.json'
  );
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = cfg.tokens ||
    (Array.isArray(cfg.accounts) && cfg.accounts[0] && cfg.accounts[0].tokens);
  if (!tokens || !tokens.access_token) {
    throw new Error('No access_token found in firebase-tools.json');
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null };
}

// ── HTTP helpers (proxy-aware: Clash etc. via CONNECT tunnel) ───────────────

// The Firebase CLI's installed-app OAuth client. This pair ships inside the
// public firebase-tools package; it is NOT a user secret or private key.
const FIREBASE_CLI_OAUTH = {
  clientId: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
};

function httpsRequestDirect(options, url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsRequestViaProxy(proxyUrl, url, options, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const proxy = new URL(proxyUrl);
    const port = target.port || 443;
    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: { Host: `${target.hostname}:${port}` },
    });
    connectReq.setTimeout(REQUEST_TIMEOUT_MS, () => {
      connectReq.destroy(new Error(`proxy CONNECT timeout (${REQUEST_TIMEOUT_MS}ms)`));
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed: HTTP ${res.statusCode}`));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const req = https.request({
          ...options,
          createConnection: () => tlsSocket,
          host: target.hostname,
          port,
          path: target.pathname + target.search,
        }, (res2) => {
          let data = '';
          res2.on('data', (c) => (data += c));
          res2.on('end', () => resolve({ status: res2.statusCode, body: data }));
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.destroy(new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });
      tlsSocket.on('error', reject);
    });
    connectReq.on('error', reject);
    connectReq.end();
  });
}

function request(url, { method = 'GET', token, body, contentType = 'application/json' } = {}) {
  const headers = { 'Content-Type': contentType };
  if (token) headers.Authorization = `Bearer ${token}`;
  const options = { method, headers };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  return proxy
    ? httpsRequestViaProxy(proxy, url, options, body)
    : httpsRequestDirect(options, url, body);
}

async function refreshAccessToken(refreshToken) {
  const form = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: FIREBASE_CLI_OAUTH.clientId,
    client_secret: FIREBASE_CLI_OAUTH.clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await request('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    body: form.toString(),
    contentType: 'application/x-www-form-urlencoded',
  });
  if (res.status !== 200) {
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body).access_token;
}

// ── Firestore value conversion ──────────────────────────────────────────────

function toFirestoreValue(value) {
  if (value === null || value === undefined) return null; // caller omits
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  throw new Error(`Unsupported field value: ${JSON.stringify(value)}`);
}

function toFirestoreFields(item) {
  const fields = {};
  for (const [key, value] of Object.entries(item)) {
    const v = toFirestoreValue(value);
    if (v) fields[key] = v;
  }
  return fields;
}

// ── Writes ──────────────────────────────────────────────────────────────────

// Throws an error tagged with `expiredAuth` when the token is rejected, so the
// caller can refresh once and retry instead of failing the whole batch.
async function createItem(item, token) {
  const res = await request(`${FIRESTORE_BASE}/items`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fields: toFirestoreFields(item) }),
  });
  if (res.status === 401) {
    const err = new Error(`HTTP 401: ${res.body.slice(0, 120)}`);
    err.expiredAuth = true;
    throw err;
  }
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`);
  }
  return JSON.parse(res.body).name.split('/').pop();
}

// PATCH a subset of fields onto an existing document. The updateMask keeps this
// a merge: any field not listed keeps its current value on the server.
async function updateItem(fbId, fields, token) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const res = await request(`${FIRESTORE_BASE}/items/${fbId}?${mask}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  if (res.status === 401) {
    const err = new Error(`HTTP 401: ${res.body.slice(0, 120)}`);
    err.expiredAuth = true;
    throw err;
  }
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`);
  }
  return decodeFields(JSON.parse(res.body).fields);
}

// Minimal decoder so the "after" line printed by updateItem is readable.
function decodeFields(fields) {
  const out = {};
  for (const [key, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) out[key] = v.stringValue;
    else if ('integerValue' in v) out[key] = Number(v.integerValue);
    else if ('doubleValue' in v) out[key] = Number(v.doubleValue);
    else if ('booleanValue' in v) out[key] = v.booleanValue;
    else if ('nullValue' in v) out[key] = null;
    else if ('timestampValue' in v) out[key] = v.timestampValue;
    else out[key] = '(unsupported)';
  }
  return out;
}

// Run `fn(token)`, refreshing the access token once on 401 and retrying.
async function withTokenRefresh(auth, tokenRef, fn, label) {
  try {
    return await fn(tokenRef.token);
  } catch (err) {
    if (!err.expiredAuth || !auth.refreshToken) throw err;
    console.log(`  [..] ${label}: token expired, refreshing ...`);
    tokenRef.token = await refreshAccessToken(auth.refreshToken);
    return fn(tokenRef.token);
  }
}

async function bumpLastManualUpdate(token) {
  const now = new Date().toISOString();
  const res = await request(
    `${FIRESTORE_BASE}/metadata/dashboard?updateMask.fieldPaths=lastManualUpdate`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ fields: { lastManualUpdate: { timestampValue: now } } }),
    }
  );
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`);
  }
  return now;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Create Firestore Items ===\n');
  if (DRY_RUN) console.log('[DRY RUN] No Firestore writes will be made.\n');

  const { newItems, updates } = loadBatch();
  console.log(`Batch file: ${DATA_PATH}\n`);

  const auth = loadAccessToken();
  console.log('Firebase access token loaded.\n');

  console.log(`Items to create: ${newItems.length}`);
  for (const item of newItems) {
    console.log(`  ${item.id} | ${item.name} | ${item.type}/${item.sort} | ` +
      `${item.status} | playTime=${item.playTime ?? '-'} | passDate=${item.passDate ?? '-'}` +
      (item.steam_app_id ? ` | steam_app_id=${item.steam_app_id}` : ''));
  }
  console.log(`\nDocuments to update: ${updates.length}`);
  for (const { fb_id, fields } of updates) {
    const shown = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`  ${fb_id} | ${shown}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log(`Pass --apply to write these documents to Firestore.`);
    return;
  }

  const tokenRef = { token: auth.accessToken };
  const created = [];

  for (const item of newItems) {
    try {
      const fbId = await withTokenRefresh(
        auth, tokenRef, (t) => createItem(item, t), item.id
      );
      created.push([item.id, fbId]);
      console.log(`  [OK] ${item.id} ${item.name} -> ${fbId}`);
    } catch (err) {
      console.error(`  [FAIL] ${item.id} ${item.name}: ${err.message}`);
    }
  }

  let updated = 0;
  for (const { fb_id, fields } of updates) {
    try {
      const after = await withTokenRefresh(
        auth, tokenRef, (t) => updateItem(fb_id, fields, t), fb_id
      );
      updated++;
      console.log(`  [OK] ${fb_id} -> ${JSON.stringify(after)}`);
    } catch (err) {
      console.error(`  [FAIL] ${fb_id}: ${err.message}`);
    }
  }

  try {
    const ts = await withTokenRefresh(
      auth, tokenRef, (t) => bumpLastManualUpdate(t), 'metadata'
    );
    console.log(`\n  [OK] metadata/dashboard.lastManualUpdate = ${ts}`);
  } catch (err) {
    console.error(`\n  [FAIL] metadata bump: ${err.message}`);
  }

  console.log(`\nCreated ${created.length}/${newItems.length} document(s).`);
  console.log(`Updated ${updated}/${updates.length} document(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
