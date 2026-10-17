#!/usr/bin/env node
/**
 * create_items.js — Create new documents in the Firestore `items` collection.
 *
 * Reads a Firebase access token from ~/.config/configstore/firebase-tools.json
 * (the same credentials file the Firebase CLI and tools/bind_steam_ids use),
 * then POSTs each entry of NEW_ITEMS as a new document (Firestore auto-generates
 * the document id). Finally it bumps `metadata/dashboard.lastManualUpdate` so
 * the dashboard header reflects the change.
 *
 * Field values are plain JS: string -> stringValue, integer -> integerValue,
 * non-integer number -> doubleValue, boolean -> booleanValue. `undefined`/null
 * fields are omitted instead of being written as nullValue.
 *
 * Usage:
 *   node tools/create_items/create_items.js            # dry run (default), no writes
 *   node tools/create_items/create_items.js --apply    # LIVE run, writes to Firestore
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

// Opt-in to writes. Running with no arguments is a preview — matches
// tools/bind_steam_ids/ and tools/update_unsold_physical_estimates/.
const DRY_RUN = !process.argv.includes('--apply');

// ── Items to create ─────────────────────────────────────────────────────────
//
// Keep this list REPLACED (not appended) once the entries are live, so a stray
// re-run cannot duplicate records. Ids follow the existing convention:
//   d-#### drama, v-#### steam, n-#### switch, etc.
//
// playTime for dramas mirrors js/ui/item-form.js:
//   playTime = episodeCount * episodeDuration / 60

const NEW_ITEMS = [
  {
    id: 'd-0013',
    name: "Fate/stay night 无限剑制 (UBW)",
    type: 'drama',
    sort: '奇幻',
    status: 'passed',
    purchaseDate: '2026-10-17', // 录入日期
    startDate: '2026-10-02',    // 开始日期未提供，暂用完成日期
    purchasePrice: 0,
    from: 'free',
    episodeCount: 26,
    episodeDuration: 24,
    playTime: 10.4,
    passDate: '2026-10-02',
  },
  {
    id: 'd-0014',
    name: "Fate/stay night Heaven's Feel 剧场版三部曲",
    type: 'drama',
    sort: '奇幻',
    status: 'passed',
    purchaseDate: '2026-10-17',
    startDate: '2026-10-05',
    purchasePrice: 0,
    from: 'free',
    episodeCount: 3,
    episodeDuration: 120,
    playTime: 6,
    passDate: '2026-10-05',
  },
  {
    id: 'd-0015',
    name: 'Fate/Zero',
    type: 'drama',
    sort: '奇幻',
    status: 'passed',
    purchaseDate: '2026-10-17',
    startDate: '2026-10-17',
    purchasePrice: 0,
    from: 'free',
    episodeCount: 25,
    episodeDuration: 24,
    playTime: 10,
    passDate: '2026-10-17',
  },
  {
    id: 'v-0095',
    name: 'Fate/stay night REMASTERED',
    type: 'steam',
    sort: 'GAL',
    status: 'passed',
    startDate: '2026-10-14',
    playTime: 15,
    passDate: '2026-10-14',
    steam_app_id: 2396980,
    remarks: 'Fate 线通关',
  },
];

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

function httpsRequestDirect(options, url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
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
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
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

  const auth = loadAccessToken();
  console.log('Firebase access token loaded.\n');

  console.log(`Items to create: ${NEW_ITEMS.length}\n`);
  for (const item of NEW_ITEMS) {
    console.log(`  ${item.id} | ${item.name} | ${item.type}/${item.sort} | ` +
      `${item.status} | playTime=${item.playTime ?? '-'} | passDate=${item.passDate ?? '-'}` +
      (item.steam_app_id ? ` | steam_app_id=${item.steam_app_id}` : ''));
  }
  console.log('');

  if (DRY_RUN) {
    console.log('Pass --apply to write these documents to Firestore.');
    return;
  }

  const tokenRef = { token: auth.accessToken };
  const created = [];

  for (const item of NEW_ITEMS) {
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

  try {
    const ts = await withTokenRefresh(
      auth, tokenRef, (t) => bumpLastManualUpdate(t), 'metadata'
    );
    console.log(`\n  [OK] metadata/dashboard.lastManualUpdate = ${ts}`);
  } catch (err) {
    console.error(`\n  [FAIL] metadata bump: ${err.message}`);
  }

  console.log(`\nCreated ${created.length}/${NEW_ITEMS.length} document(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
