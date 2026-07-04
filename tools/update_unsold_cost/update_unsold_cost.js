#!/usr/bin/env node
/**
 * update_unsold_cost.js — Set unsold Switch physical games to 30 yuan estimate.
 *
 * Reads a Firebase access token from ~/.config/configstore/firebase-tools.json,
 * then PATCHes each unsold physical item in Firestore:
 *   - purchasePrice → 30 (estimated cartridge cost)
 *   - remarks        → "预估值"
 *
 * Only affects items where: type === 'physical' AND sellDate is null/missing.
 *
 * Usage:
 *   node tools/update_unsold_cost/update_unsold_cost.js            # live run
 *   node tools/update_unsold_cost/update_unsold_cost.js --dry-run  # preview only, no writes
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'game-data-dashboard';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const DRY_RUN = process.argv.includes('--dry-run');

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
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Firestore REST helpers ──────────────────────────────────────────────────

async function listDocuments(accessToken) {
  const url = `${FIRESTORE_BASE}/items`;
  return httpsRequest(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

async function patchItem(fbId, accessToken) {
  const url =
    `${FIRESTORE_BASE}/items/${fbId}?updateMask.fieldPaths=purchasePrice&updateMask.fieldPaths=remarks`;

  const body = JSON.stringify({
    fields: {
      purchasePrice: { doubleValue: 30 },
      remarks: { stringValue: '预估值' },
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
  console.log('=== Unsold Physical Games Cost Update ===\n');

  if (DRY_RUN) {
    console.log('[DRY RUN] No Firestore writes will be made.\n');
  }

  const accessToken = loadAccessToken();
  console.log('Firebase access token loaded.\n');

  // ── Fetch all items ──────────────────────────────────────────────────────

  console.log('Fetching items from Firestore...');
  const response = await listDocuments(accessToken);
  const documents = response.body.documents || [];
  console.log(`Found ${documents.length} total documents.\n`);

  // ── Filter for unsold physical games ─────────────────────────────────────

  const unsoldPhysical = [];
  const allPhysical = [];

  for (const doc of documents) {
    const fields = doc.fields || {};
    const name = fields.name?.stringValue || '(unknown)';
    const id = fields.id?.stringValue || '';
    const type = fields.type?.stringValue || '';
    const sellDate = fields.sellDate?.timestampValue || fields.sellDate?.stringValue || null;
    const purchasePrice = fields.purchasePrice?.doubleValue ?? fields.purchasePrice?.integerValue ?? null;

    if (type === 'physical') {
      allPhysical.push({ name, id, sellDate, purchasePrice, fbId: doc.name.split('/').pop() });
      if (!sellDate) {
        unsoldPhysical.push({ name, id, sellDate, purchasePrice, fbId: doc.name.split('/').pop() });
      }
    }
  }

  console.log(`All physical items:   ${allPhysical.length}`);
  console.log(`Sold physical items:  ${allPhysical.length - unsoldPhysical.length}`);
  console.log(`Unsold physical items: ${unsoldPhysical.length}`);
  console.log('');

  if (unsoldPhysical.length === 0) {
    console.log('No unsold physical items found. Nothing to do.');
    return;
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  console.log('Unsold physical items to update:\n');
  for (let i = 0; i < unsoldPhysical.length; i++) {
    const item = unsoldPhysical[i];
    const oldPrice = item.purchasePrice != null ? `¥${item.purchasePrice}` : 'N/A';
    console.log(`  ${String(i + 1).padStart(2)}. ${item.name} (${item.id})`);
    console.log(`      fb_id: ${item.fbId}  |  old price: ${oldPrice}  →  ¥30 (预估值)`);
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would update ${unsoldPhysical.length} items.`);
    return;
  }

  // ── Write to Firestore ──────────────────────────────────────────────────

  console.log('\n--- Updating Firestore ---\n');

  let successCount = 0;
  let failCount = 0;

  for (const item of unsoldPhysical) {
    try {
      await patchItem(item.fbId, accessToken);
      console.log(`  [OK] ${item.fbId} | ${item.name} (${item.id})`);
      successCount++;
    } catch (err) {
      console.error(`  [FAIL] ${item.fbId} | ${item.name} (${item.id})`);
      console.error(`         ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Updated: ${successCount}`);
  if (failCount > 0) console.log(`Failed:  ${failCount}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
