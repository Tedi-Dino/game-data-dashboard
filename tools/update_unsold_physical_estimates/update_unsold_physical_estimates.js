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
 * Usage:
 *   node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js
 *   node tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js --apply
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');

const RESTORE_PURCHASE_PRICES = new Map([
  ['7DJ2ltL4Ej2MMKtHEx4O', 134.7],
  ['9GYFd9Xb4RiLQEBe9Wej', 134.7],
  ['FIIzXaw8OqATVXYZhxrP', 290],
  ['bQhYclJW23Bby5PdNnZt', 188],
  ['zA72veAK23RZKe6mG5Kr', 225],
]);

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
  const accessToken = loadAccessToken();

  let alreadyOk = 0;
  let changed = 0;

  for (const [fbId, realPrice] of RESTORE_PURCHASE_PRICES.entries()) {
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
  console.error(error);
  process.exit(1);
});
