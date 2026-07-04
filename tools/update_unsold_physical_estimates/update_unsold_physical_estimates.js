#!/usr/bin/env node
/**
 * Updates unsold Switch physical cartridge records in Firestore.
 *
 * Match: type === 'physical' && !sellDate
 * Write: purchasePrice = 30, remarks = '预估值'
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
const ESTIMATED_COST = 30;
const ESTIMATE_REMARK = '\u9884\u4f30\u503c';

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
      res.on('data', (chunk) => (data += chunk));
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

function isMissingDate(value) {
  return value === undefined || value === null || value === '';
}

function docId(docName) {
  return docName.split('/').pop();
}

async function listAllItems(accessToken) {
  const docs = [];
  let pageToken = '';

  do {
    const url = new URL(`${FIRESTORE_BASE}/items`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const page = await httpsRequest(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    docs.push(...(page.documents || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  return docs;
}

async function patchEstimate(docName, accessToken) {
  const url = `${FIRESTORE_BASE}/items/${docId(docName)}?updateMask.fieldPaths=purchasePrice&updateMask.fieldPaths=remarks`;
  const body = JSON.stringify({
    fields: {
      purchasePrice: { doubleValue: ESTIMATED_COST },
      remarks: { stringValue: ESTIMATE_REMARK },
    },
  });

  await httpsRequest(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }, body);
}

async function main() {
  console.log(APPLY ? '[APPLY] Updating Firestore records.' : '[DRY RUN] No writes will be made.');
  const accessToken = loadAccessToken();
  const docs = await listAllItems(accessToken);

  const targets = docs.filter((doc) => {
    const fields = doc.fields || {};
    return fieldValue(fields.type) === 'physical' && isMissingDate(fieldValue(fields.sellDate));
  });

  console.log(`Scanned ${docs.length} item docs.`);
  console.log(`Matched ${targets.length} unsold physical docs.`);

  let alreadyOk = 0;
  let updated = 0;

  for (const doc of targets) {
    const fields = doc.fields || {};
    const currentPrice = fieldValue(fields.purchasePrice);
    const currentRemarks = fieldValue(fields.remarks);
    const needsUpdate = currentPrice !== ESTIMATED_COST || currentRemarks !== ESTIMATE_REMARK;
    const label = `${docId(doc.name)} | ${fieldValue(fields.id) || ''} | ${fieldValue(fields.name) || ''}`;

    if (!needsUpdate) {
      alreadyOk += 1;
      continue;
    }

    console.log(`${APPLY ? 'Updating' : 'Would update'}: ${label} | ${currentPrice} -> ${ESTIMATED_COST}`);
    if (APPLY) {
      await patchEstimate(doc.name, accessToken);
      updated += 1;
    }
  }

  console.log(`Already correct: ${alreadyOk}`);
  console.log(APPLY ? `Updated: ${updated}` : 'Run with --apply to write these changes.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
