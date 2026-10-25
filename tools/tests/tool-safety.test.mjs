// Regression guards for repository hygiene and cost/safety limits that are
// easy to undo during a refactor. Pure static assertions — no network, no
// Firestore, no timing-sensitive behaviour.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

describe('local personal data never lives in tracked tool code', () => {
    it('create_items reads an ignored JSON batch and defaults to dry-run', () => {
        const src = read('tools/create_items/create_items.js');
        assert.match(src, /argValue\('--data'/);
        assert.match(src, /const DRY_RUN = !process\.argv\.includes\('--apply'\)/);
        assert.doesNotMatch(src, /const NEW_ITEMS = \[/);
        assert.doesNotMatch(src, /量子破碎|斯普拉遁|星之卡比/);
    });

    it('bind_steam_ids reads an ignored JSON file and defaults to dry-run', () => {
        const src = read('tools/bind_steam_ids/bind_steam_ids.js');
        assert.match(src, /argValue\('--data'/);
        assert.match(src, /const DRY_RUN = !process\.argv\.includes\('--apply'\)/);
        assert.doesNotMatch(src, /const BINDINGS = \[/);
        assert.doesNotMatch(src, /半条命2|传送门2/);
    });

    it('update_unsold_physical_estimates reads an ignored JSON repair table', () => {
        const src = read('tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js');
        assert.match(src, /argValue\('--data'/);
        assert.doesNotMatch(src, /const RESTORE_PURCHASE_PRICES = new Map/);
    });

    it('.gitignore covers every local data file and dump output', () => {
        const ignore = read('.gitignore');
        for (const pattern of [
            'tools/create_items/batch.json',
            'tools/bind_steam_ids/bindings.json',
            'tools/update_unsold_physical_estimates/repairs.json',
            'tools/dump_items/*.json',
            'tools/dump_items/out/',
            'tools/steam_info/output/',
            '**/.env',
        ]) {
            assert.ok(ignore.includes(pattern), `.gitignore missing ${pattern}`);
        }
    });

    it('ignores real dotenv files but keeps placeholder templates', () => {
        const ignored = (file) => {
            try {
                execFileSync('git', ['check-ignore', '-q', '--no-index', file], { cwd: repoRoot });
                return true;
            } catch {
                return false;
            }
        };
        assert.equal(ignored('.env.local'), true);
        assert.equal(ignored('.env.production'), true);
        assert.equal(ignored('tools/somewhere/.env.local'), true);
        assert.equal(ignored('.env.example'), false);
        assert.equal(ignored('.env.sample'), false);
    });
});

describe('hosting bundle stays limited to runtime files', () => {
    const firebaseJson = JSON.parse(read('firebase.json'));
    const ignore = firebaseJson.hosting.ignore;

    it('excludes docs, tools, functions and local data', () => {
        for (const pattern of ['tools/**', 'docs/**', '**/functions/**', '**/*.md', '**/*.json', '**/*.mjs']) {
            assert.ok(ignore.includes(pattern), `hosting.ignore missing ${pattern}`);
        }
    });

    it('does not exclude the files the page actually loads', () => {
        for (const pattern of ['js/**', 'css/**', 'index.html', '**/*.js', '**/*.css', '**/*.html']) {
            assert.equal(ignore.includes(pattern), false, `hosting.ignore must not exclude ${pattern}`);
        }
    });
});

describe('outbound API calls are bounded', () => {
    it('Cloud Functions set explicit DeepSeek and Steam timeouts', () => {
        const src = read('functions/index.js');
        assert.match(src, /const DEEPSEEK_TIMEOUT_MS = 45 \* 1000/);
        assert.match(src, /const STEAM_TIMEOUT_MS = 20 \* 1000/);
        assert.match(src, /timeout: DEEPSEEK_TIMEOUT_MS/);
        assert.match(src, /fetch\(url, \{timeout: STEAM_TIMEOUT_MS\}\)/);
        assert.match(src, /maxInstances: 2/);
        assert.match(src, /maxInstances: 1/);
        assert.match(src, /claimFunctionQuota\("aiRecommendations"/);
        assert.match(src, /claimFunctionQuota\("steamSync"/);
    });

    it('browser DeepSeek fallback aborts after 60 seconds', () => {
        const src = read('js/services/recommendations.js');
        assert.match(src, /const AI_REQUEST_TIMEOUT_MS = 60 \* 1000/);
        assert.match(src, /setTimeout\(\(\) => \{/);
        assert.match(src, /controller\.abort\(\)/);
        assert.match(src, /clearTimeout\(timeoutId\)/);
    });

    it('local sync transport has a socket timeout', () => {
        const src = read('tools/steam_sync/firestore.mjs');
        assert.match(src, /const REQUEST_TIMEOUT_MS = 30 \* 1000/);
        assert.match(src, /req\.setTimeout\(REQUEST_TIMEOUT_MS/);
        assert.match(src, /connectReq\.setTimeout\(REQUEST_TIMEOUT_MS/);
    });
});

describe('bulk import cannot lose the final snapshot', () => {
    it('stores snapshots that arrive while importing and applies them afterwards', () => {
        const src = read('js/services/firestore.js');
        assert.match(src, /let deferredSnapshot = null/);
        assert.match(src, /if \(importing\) \{\s*deferredSnapshot = snapshot;/);
        assert.match(src, /importing = true;[\s\S]*?finally \{\s*importing = false;[\s\S]*?applyItemsSnapshot\(pending\)/);
    });
});

describe('Firestore rules keep writes admin-only and reads public', () => {
    it('items are publicly readable but only admins may write', () => {
        const rules = read('firestore.rules').replace(/\/\/[^\n]*/g, '');
        assert.match(rules, /match \/items\/\{itemId\} \{\s*allow read: if true;\s*allow write: if isAdmin\(\);/);
        assert.match(rules, /request\.auth\.uid == '[A-Za-z0-9]{28}'/);
        assert.doesNotMatch(rules, /allow read, write: if true/);
    });
});
