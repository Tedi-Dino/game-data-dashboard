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
firebase deploy
firebase deploy --only hosting
firebase deploy --only functions
```

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
actions disabled. Admins can add/edit/delete items, import/export CSV, and run
Steam sync.

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

`syncSteamData` is an admin-only callable Cloud Function. It fetches the Steam
library, fuzzy-matches local items, binds `steam_app_id`, updates playtime when
`steam_override !== false`, and checks achievements to update
`fullyCompleted`. `scheduledSteamSync` runs daily at 4:00 AM CST.

## AI Recommendations

The `接下来` modal calls `getAiRecommendations`. The primary path is the
Firebase Cloud Function. The browser fallback calls DeepSeek directly with a
user-provided API key and includes both games and dramas.

> **Security note**: The DeepSeek API key stored in `localStorage` is intended
> for local development only. On the production site, the Cloud Function should
> always be the primary path. The local-mode API key entry in the UI is hidden
> for non-admin visitors to prevent accidental exposure.

## Standalone Tools

```text
tools/
├── bind_steam_ids/
│   └── bind_steam_ids.js
├── cost_per_hour/
│   ├── cost_per_hour_trend.py
│   └── cost_per_hour_trend.png
├── perf_test/
│   └── (Puppeteer performance test scripts)
├── steam_info/
│   ├── steam_info.py
│   ├── run.bat
│   └── .env
├── tests/
│   └── (unit tests for core logic using node:test)
├── update_unsold_cost/
│   └── update_unsold_cost.js  (DEPRECATED - see README)
└── update_unsold_physical_estimates/
    └── update_unsold_physical_estimates.js
```

Tool notes:

- `tools/cost_per_hour/cost_per_hour_trend.py` reads the newest
  `game_cost_export_*.csv` and generates a cost-per-hour trend PNG.
- `tools/bind_steam_ids/bind_steam_ids.js` patches Steam App IDs through the
  Firebase REST API.
- `tools/steam_info/steam_info.py` fetches Steam profile/library data into CSV
  files under `tools/steam_info/output/`.
- `tools/tests/` contains unit tests for core logic (`netCost`, CSV parsing,
  date parsing, AI JSON parsing) using Node's built-in `node:test`.
- `tools/update_unsold_cost/update_unsold_cost.js` is **DEPRECATED**. It violates
  the current database rule (see its README for details).
- `tools/update_unsold_physical_estimates/update_unsold_physical_estimates.js`
  dry-runs by default and repairs the accidental migration that wrote the
  display-only 30 yuan estimate into Firestore `purchasePrice`. The intended
  rule is: database `purchasePrice` stays real; frontend `netCost(item)` applies
  the 30 yuan display estimate for unsold physical cartridges.
