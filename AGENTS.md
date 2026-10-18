# AGENTS.md

This file is the Codex-facing project guide. It replaces the old Claude Code
entry point for day-to-day AI-assisted development in this repository.

## Project Overview

Personal game data dashboard (`个人游戏数据仪表盘`) for tracking game purchases,
playtime, cost, completion status, achievement completion, dramas, and platform
distribution. It is a single-page Firebase-backed app built with vanilla
JavaScript ES modules.

## Development

This is a zero-build project:

```bash
# Serve the repository root with any static file server
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:<port>` in a browser. The app loads Firebase ES modules
directly from `https://www.gstatic.com/firebasejs/11.6.1/`; there is no
`package.json`, bundler, install step, or test suite for the frontend.

Firebase Cloud Functions live in `functions/index.js`. The root `index.js` is
only a reference copy; treat `functions/index.js` as authoritative.

Note for Windows PowerShell:
  Use `-Encoding utf8` when reading Chinese files (e.g., `Get-Content -Encoding utf8`).
  Without this flag, Chinese characters may display as garbled text.

Common deploy commands:

```bash
firebase deploy --only hosting,firestore:rules   # the Spark (free) release
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

> **Caution:** `firebase.json` wires `firestore.rules` into the deploy, so a bare
> `firebase deploy` silently republishes your security rules from this repo. If
> the committed rules are stale or edited, that changes the live permission
> boundary. Prefer `--only hosting` for routine releases and deploy rules
> deliberately with `firebase deploy --only firestore:rules`.

> **Spark plan:** `firebase.json` intentionally has **no `functions` block** —
> Cloud Functions need a billing account and would fail the whole deploy. See
> "Firebase Plan" below and `docs/free-tier-plan.md` before adding it back.

> **Admin UIDs** live in three places that must stay identical: `firestore.rules`,
> `functions/index.js` (`ADMIN_UIDS`) and `js/config/constants.js` (`ADMIN_UIDS`).
> `tools/tests/config-consistency.test.mjs` enforces this — run it after changing
> an admin.

## Firebase Plan

**Policy (2026-10-18): Spark is the default and the long-term plan.** The online
site is expected to stay on the free tier; Blaze is an optional branch that must
keep working, not the baseline every change is designed against. New features
must therefore work without Cloud Functions, Cloud Scheduler or Secret Manager —
if a feature cannot, it has to degrade visibly (hidden entry point or local
substitute), never as a silent no-op.

The project runs on **Spark (free)**. The only capability that disappears is
Cloud Functions (and Cloud Scheduler / Secret Manager with it), so every
browser-side callable is behind a switch in `js/config/constants.js`:

```js
export const FEATURES = {
    STEAM_SYNC: false,       // manual Steam sync via Cloud Function
    SCHEDULED_SYNC: false,   // daily 04:00 Cloud Scheduler run
    AI_LOCAL_ONLY: true,     // AI recommendations call DeepSeek from the browser
    APP_CHECK: false,        // reCAPTCHA Enterprise App Check init
};
```

- `SCHEDULED_SYNC` without `STEAM_SYNC` throws at import time — a schedule with
  nothing to run would fail silently.
- `tools/tests/free-tier.test.mjs` asserts that a `firebase.json` without a
  `functions` block can never ship with these switches on.
- **App Check is off deliberately.** Firestore's App Check enforcement is
  `UNENFORCED` for this project: the reCAPTCHA Enterprise token request pulls
  `www.google.com`, which never completes on a mainland network, and Firestore
  then waits forever for a token. With enforcement left on, every read returns
  `permission-denied` and the dashboard shows nothing. See
  `docs/free-tier-plan.md` §2.1 before turning either back on.
- **Paid-only UI must not be visible.** `#steam-sync-btn` stays hidden unless
  `STEAM_SYNC` is on, and the AI column of the `接下来` modal is hidden for
  non-admins (the DeepSeek key lives in the admin's browser on this plan), so a
  visitor never sees an entry point that can only fail.
- Going back to Blaze: restore `"functions": { "source": "functions" }`, flip the
  switches to `{STEAM_SYNC: true, SCHEDULED_SYNC: true, AI_LOCAL_ONLY: false}`,
  re-set both secrets, disable the local scheduled task, and only then verify
  App Check tokens work before setting `APP_CHECK: true` + `ENFORCED`.

**Do not delete `functions/`.** The code is frozen but still authoritative for
the Blaze path, and `tools/tests/config-consistency.test.mjs` reads it for the
admin UID, AI prompt and Steam ID assertions.

## Codex Working Notes

- Prefer small, local edits that follow the existing vanilla JS module style.
- Use `rg` for search and read the relevant modules before changing behavior.
- Do not introduce a build step, framework, package manager, or formatter unless
  the user explicitly asks for it.
- Do not overwrite Firestore data casually. For any bulk data migration, add or
  use a script with a dry-run mode first, then run the write only after the
  target set is clear.
- Keep generated caches and local outputs out of commits, especially
  `__pycache__/`, Firebase debug logs, and tool output directories.
- `AGENTS.md` is the current AI-agent guide. `CLAUDE.md` is legacy context and
  should not be treated as the source of truth.
- `docs/README.md` indexes the documentation. `docs/archive/` holds one-off audit
  reports and finished plans — read them for history, never as current truth.

## Design System

The page uses a warm Tailwind Stone base (`#f5f0ed`) with Amber accent
(`#d97706`). Platform colors are muted warm pastels derived from brand colors;
see `js/config/constants.js` (`PLATFORM_COLORS`) and `design.md`.

Chart conventions:

- Trend lines use `pointRadius: 0`.
- The scatter chart uses a misty cyan tint gradient, white-bordered points, and
  glow halos for high-rated games.
- Cards and controls should stay consistent with the existing compact dashboard
  style.

## Architecture

```text
js/
├── config/
│   ├── firebase.js        # Firebase app/auth/firestore/functions init
│   └── constants.js       # Admin UIDs, platform colors, maps, chart ranges
├── core/
│   ├── cache.js           # IndexedDB cache for instant first render
│   ├── state.js           # Central mutable state: items, sortConfig, charts
│   └── utils.js           # Formatters, dates, stars, net cost, escaping
├── services/
│   ├── firestore.js       # onSnapshot listener, CRUD, bulk CSV replace
│   ├── csv.js             # CSV import/export
│   ├── steam.js           # Steam callable wrapper + metadata listener
│   └── recommendations.js # AI recommendations via Cloud Function/fallback
├── charts/
│   ├── setup.js
│   ├── cost-distribution.js
│   ├── time-distribution.js
│   ├── game-sort.js
│   ├── game-distribution.js
│   └── monthly-trends.js
├── ui/
│   ├── auth.js
│   ├── dashboard.js
│   ├── modals.js
│   ├── item-form.js
│   ├── data-table.js
│   ├── play-next.js
│   ├── fab.js
│   ├── csv-handlers.js
│   ├── chart-controls.js
│   └── on-this-day.js
└── main.js
```

## Data Flow

`firestore.js` loads cached items from IndexedDB first, then attaches a
Firestore `items` collection `onSnapshot` listener. Each update writes to
`state.items`, refreshes the cache, and triggers the `onDataChange` callback in
`main.js`. KPI cards and charts should read from `state.items`, not from their
own data copies.

`main.js` hashes key item fields to skip unnecessary full chart re-renders.
When adding fields that affect rendered output, include them in that hash.

## Auth Model

Google Sign-In is handled through Firebase Auth. Admin UIDs are hardcoded in
`js/config/constants.js`. Non-admin users get read-only UI: FAB hidden and form
actions actually disabled (`btn.disabled = true` plus a `.readonly-mode-disabled`
class — see `js/ui/auth.js`). Table rows no longer receive `pointer-events: none`,
so visitors can still select and copy text; edits are blocked by the `isAdmin()`
guard in `handleEditItem()`. Admins can add/edit/delete items, import/export CSV,
and run Steam sync.

## Data Model

Core item fields:

`id`, `name`, `type`, `sort`, `status`, `purchaseDate`, `startDate`,
`purchasePrice`, `from`, `playTime`, `passDate`, `sellDate`, `sellPrice`,
`rating`, `episodeCount`, `episodeDuration`, `fullyCompleted`, `remarks`.

Steam fields:

`steam_app_id`, `steam_override`, `steam_last_sync`.

Client-side Firestore doc IDs are stored as `fb_id`.

Important cost rule:

- Unsold Switch physical cartridges are identified by
  `type === 'physical' && !sellDate`.
- Their effective net cost is a fixed `30` yuan estimate.
- Use `netCost(item)` from `js/core/utils.js` for actual/effective spending
  calculations instead of reimplementing `purchasePrice - sellPrice`.
- Use `effectiveRemarks(item)` when display should show the default estimate
  note (`预估值`) for unsold physical cartridges.

Drama items (`type: 'drama'`) calculate `playTime` from
`episodeCount * episodeDuration / 60`.

## Steam Sync

Two paths, same maths:

- **Blaze:** `syncSteamData` is an admin-only callable that fetches the Steam
  library, fuzzy-matches local items, binds `steam_app_id`, raises `playTime`
  when `steam_override !== false`, and checks achievements to update
  `fullyCompleted`. `scheduledSteamSync` runs daily at 4:00 AM CST.
- **Spark (default):** neither function is deployed. The browser only shows the
  last-sync line, and `node tools/steam_sync/sync.mjs --apply` does the work from
  this machine (Windows Task Scheduler at 04:00). The in-page sync button is
  never rendered on this plan.

Both paths share `functions/steam-sync-core.js` (name matching) and
`functions/steam-playtime.js` (delta maths), so they cannot drift into computing
different playtimes.

## AI Recommendations

The `接下来` modal calls `getAiRecommendations`. On Spark
(`FEATURES.AI_LOCAL_ONLY`) it calls DeepSeek directly from the browser with the
admin's own API key, shown behind the gear icon. On Blaze the Cloud Function is
the primary path and the browser call is the fallback.

The whole AI column is hidden for non-admins on the free plan — a visitor has no
key, so the panel could only ever return "未配置 API Key". The backlog list takes
the full width instead.

> **Security note**: The DeepSeek API key stored in `localStorage` is visible to
> anyone using that browser profile. The AI section is admin-only in the UI, so
> visitors never see the key entry.

Both prompt copies must stay byte-identical. `tools/tests/config-consistency.test.mjs`
asserts this, and the parser lives in `js/services/recommendation-parse.js` so it
can be unit tested without loading Firebase.

## Known Trade-offs

These are deliberate decisions, **not oversights** — do not "fix" them without
asking first.

- **Tailwind Play CDN** (`index.html:38`). Tailwind's own docs mark the Play CDN
  as unsuitable for production: it compiles CSS at runtime in the browser and
  blocks first paint. The correct fix is a pre-generated static stylesheet,
  which requires running the Tailwind CLI — i.e. a build step, which conflicts
  with this project's zero-build constraint. Resolving it needs a product
  decision (accept the cost, add SRI + `defer`, or vendor a generated CSS file),
  so it stays as-is for now.
- **No Content-Security-Policy header.** The page pulls from roughly nine
  external origins (Firebase, gstatic, Tailwind, Chart.js, Font Awesome, Steam,
  DeepSeek, ui-avatars replacements). Enumerating all of them is error-prone:
  missing one breaks the live site. Deferred deliberately.
- **Local `core.autocrlf` settings are per-machine.** `.gitattributes` pins
  repository line endings to LF, so cross-file consistency checks (the A3 prompt
  diff, the B10 admin-UID test) are not affected by a contributor's local config.

## Standalone Tools

`tools/README.md` is the index (status + dry-run/credential rules). Layout:

```text
tools/
├── README.md
├── bind_steam_ids/
│   └── bind_steam_ids.js
├── cost_per_hour/
│   ├── cost_per_hour_trend.py
│   └── cost_per_hour_trend.png
├── perf_test/
│   └── (Puppeteer performance test scripts)
├── steam_info/
│   ├── steam_info.py
│   └── run.bat
├── steam_sync/
│   ├── sync.mjs        # Spark-plan Steam sync (Firestore REST + Steam Web API)
│   ├── lib.mjs         # pure planning helpers (tested)
│   └── firestore.mjs   # OAuth + proxy-aware REST transport
├── tests/
│   └── (unit tests for core logic using node:test)
├── update_unsold_cost/
│   └── update_unsold_cost.js  (DEPRECATED - see README)
└── update_unsold_physical_estimates/
    └── update_unsold_physical_estimates.js
```

Anything that writes defaults to dry-run; only `--apply` writes. Scripts authenticate
with the Firebase CLI OAuth token, i.e. project-owner credentials that bypass
`firestore.rules` — see `docs/firebase-security.md`.

Tool notes:

- `tools/cost_per_hour/cost_per_hour_trend.py` reads the newest
  `game_cost_export_*.csv` and generates a cost-per-hour trend PNG.
- `tools/bind_steam_ids/bind_steam_ids.js` patches Steam App IDs through the
  Firebase REST API.
- `tools/steam_info/steam_info.py` fetches Steam profile/library data into CSV
  files under `tools/steam_info/output/`.
- `tools/steam_sync/sync.mjs` replaces Cloud Scheduler on the Spark plan. It
  dry-runs by default, reads `STEAM_API_KEY` from the env or
  `tools/steam_sync/.env`, and writes through the Firestore REST API with the
  Firebase CLI token. `--games-file` runs it offline against a fixture.
- `tools/tests/` contains unit tests for core logic (`netCost`, CSV parsing,
  date parsing, AI JSON parsing) using Node's built-in `node:test`.
- `tools/update_unsold_cost/update_unsold_cost.js` is **DEPRECATED**. It violates
  the current database rule (see its README for details).
- `tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js`
  dry-runs by default and repairs the accidental migration that wrote the
  display-only 30 yuan estimate into Firestore `purchasePrice`. The intended
  rule is: database `purchasePrice` stays real; frontend `netCost(item)` applies
  the 30 yuan display estimate for unsold physical cartridges.
