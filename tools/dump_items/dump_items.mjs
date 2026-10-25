#!/usr/bin/env node
/**
 * tools/dump_items/dump_items.mjs — read-only dump of the Firestore `items`
 * collection.
 *
 * The write side of a data-entry batch (tools/create_items) can only reconcile
 * "new record vs. complete an existing one" if it can SEE the live collection
 * first. This prints one line per document so a batch can be planned without
 * guessing from memory, and can spill the full JSON for a closer look.
 *
 * Never writes. Authenticates with the Firebase CLI's OAuth token, the same
 * credential tools/create_items and tools/bind_steam_ids use.
 *
 * Usage:
 *   node tools/dump_items/dump_items.mjs                 # one line per item
 *   node tools/dump_items/dump_items.mjs 控制             # only names matching this regex
 *   node tools/dump_items/dump_items.mjs --json           # write tools/dump_items/out/items-<date>.json
 *   node tools/dump_items/dump_items.mjs --json items.json
 *
 * Output files default to tools/dump_items/out/ (gitignored). A snapshot of the
 * live collection is personal data — never commit it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    listDocuments,
    loadAccessToken,
    withTokenRefresh,
} from '../steam_sync/firestore.mjs';

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonRequested = jsonIdx >= 0;
const jsonPathArg = jsonRequested ? args[jsonIdx + 1] : null;
const jsonPath = jsonRequested
    ? (jsonPathArg && !jsonPathArg.startsWith('--')
        ? jsonPathArg
        : path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            'out',
            `items-${new Date().toISOString().slice(0, 10)}.json`
        ))
    : null;
const jsonValIdx = jsonRequested && jsonPathArg && !jsonPathArg.startsWith('--') ? jsonIdx + 1 : -1;
const filterArg = args.find((a, i) => !a.startsWith('--') && i !== jsonValIdx);
const filter = filterArg ? new RegExp(filterArg) : null;

const show = (v) => (v === undefined || v === null || v === '' ? '-' : v);

const auth = loadAccessToken();
const tokenRef = { token: auth.accessToken };
const docs = await withTokenRefresh(auth, tokenRef, (t) => listDocuments('items', t));

const items = docs
    .map((d) => ({ fb_id: d.id, ...d.data }))
    .filter((i) => !filter || filter.test(String(i.name || '')))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

for (const i of items) {
    console.log([
        i.fb_id,
        show(i.id),
        show(i.name),
        show(i.type),
        show(i.sort),
        show(i.status),
        'pd=' + show(i.purchaseDate),
        'sd=' + show(i.startDate),
        'pass=' + show(i.passDate),
        'price=' + show(i.purchasePrice),
        'sell=' + show(i.sellPrice) + '/' + show(i.sellDate),
        'from=' + show(i.from),
        'pt=' + show(i.playTime),
        'rating=' + show(i.rating),
        'ep=' + show(i.episodeCount) + 'x' + show(i.episodeDuration),
        'fc=' + show(i.fullyCompleted),
        'stid=' + show(i.steam_app_id),
        'rm=' + show(i.remarks),
    ].join(' | '));
}

console.log(`\n${items.length} item(s)` + (filter ? ` matching /${filterArg}/` : ''));

if (jsonPath) {
    fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2), 'utf8');
    console.log(`full JSON -> ${jsonPath}`);
}
