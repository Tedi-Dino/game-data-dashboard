#!/usr/bin/env node
/**
 * Repairs the accidental migration that wrote the display-only 30 yuan estimate
 * into Firestore purchasePrice for unsold physical cartridges.
 *
 * Database rule:
 * - purchasePrice stores the real purchase price.
 * - Display-only effective spending for unsold physical cartridges is handled
 *   in the frontend by netCost(item), not by changing Firestore data.
 *
 * The doc-id -> real-price table is local data (default repairs.json,
 * gitignored), not code. Copy repairs.example.json to repairs.json and fill it
 * from a known-good backup before running.
 *
 * Usage:
 *   node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js
 *   node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --apply
 *   node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --data other.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const APPLY = process.argv.includes('--apply');

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

const DATA_PATH = path.resolve(
  argValue('--data', path.join(__dirname, 'repairs.json'))
);

function loadRepairs() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(
      `找不到 ${DATA_PATH}\n` +
      '把 tools/update_unsold_physical_estimates/repairs.example.json 复制为 repairs.json 后填写；' +
      '真实修复表含个人购买价格，已被 .gitignore 忽略。'
    );
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`${DATA_PATH} 不是合法 JSON: ${err.message}`);
  }
  if (!data || !Array.isArray(data.repairs)) {
    throw new Error('repairs.json 必须包含 repairs 数组');
  }
  const map = new Map();
  data.repairs.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`repairs[${index}] 应为 [fb_id, realPrice]`);
    }
    const [fbId, price] = entry;
    if (typeof fbId !== 'string' || !/^[A-Za-z0-9_-]{10,}$/.test(fbId)) {
      throw new Error(`repairs[${index}] fb_id 非法`);
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      throw new Error(`repairs[${index}] 价格必须是非负数字`);
    }
    if (map.has(fbId)) throw new Error(`repairs 中 fb_id 重复: ${fbId}`);
    map.set(fbId, price);
  });
  return map;
}

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

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
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

function fieldValue(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return field.booleanValue;
  if ('nullValue' in field) return null;
  if ('timestampValue' in field) return field.timestampValue;
  return undefined;
}

async function getItem(fbId, accessToken) {
  return httpsRequest(`${FIRESTORE_BASE}/items/${fbId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function patchPurchasePrice(fbId, purchasePrice, accessToken) {
  const body = JSON.stringify({
    fields: {
      purchasePrice: { doubleValue: purchasePrice },
    },
  });

  await httpsRequest(`${FIRESTORE_BASE}/items/${fbId}?updateMask.fieldPaths=purchasePrice`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, body);
}

async function main() {
  console.log(APPLY ? '[APPLY] Restoring real purchase prices.' : '[DRY RUN] No writes will be made.');
  const repairs = loadRepairs();
  console.log(`Repairs file: ${DATA_PATH} (${repairs.size} entries)\n`);
  const accessToken = loadAccessToken();

  let alreadyOk = 0;
  let changed = 0;

  for (const [fbId, realPrice] of repairs.entries()) {
    const doc = await getItem(fbId, accessToken);
    const fields = doc.fields || {};
    const currentPrice = fieldValue(fields.purchasePrice);
    const label = `${fbId} | ${fieldValue(fields.id) || ''} | ${fieldValue(fields.name) || ''}`;

    if (currentPrice === realPrice) {
      alreadyOk += 1;
      console.log(`OK: ${label} | purchasePrice ${currentPrice}`);
      continue;
    }

    console.log(`${APPLY ? 'Restoring' : 'Would restore'}: ${label} | ${currentPrice} -> ${realPrice}`);
    if (APPLY) {
      await patchPurchasePrice(fbId, realPrice, accessToken);
      changed += 1;
    }
  }

  console.log(`Already correct: ${alreadyOk}`);
  console.log(APPLY ? `Restored: ${changed}` : 'Run with --apply to write these changes.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
