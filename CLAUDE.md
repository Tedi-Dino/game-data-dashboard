# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

个人游戏数据仪表盘 — a personal game library dashboard for tracking game purchases, playtime, costs, and platform distribution. Single-page app with Firebase backend.

## Development

This is a **zero-build vanilla JS project**. There is no bundler, no package.json, and no test suite. To develop:

```bash
# Serve the root directory (any static file server works)
npx serve .              # or: python -m http.server 8080
```

Open `http://localhost:<port>` in a browser. ES modules are loaded from the Firebase CDN (`gstatic.com/firebasejs/11.6.1/`) directly in the browser — no `npm install` needed.

The Firebase Cloud Function source is at `functions/index.js`. Deploy with `firebase deploy --only functions`. The root `index.js` is a copy kept for reference; the authoritative source is in `functions/`.

## Architecture

```
js/
├── config/
│   ├── firebase.js        # Firebase app/auth/firestore/functions init
│   └── constants.js        # Admin UIDs, platform colors, type/status maps, chart range configs
├── core/
│   ├── state.js            # Centralized mutable state: items[], sortConfig, charts{}, etc.
│   └── utils.js            # Formatters (currency, dates, stars), escapeHTML, netCost, hash utility
├── services/
│   ├── firestore.js        # Firestore onSnapshot listener, CRUD helpers, bulk CSV replace
│   ├── csv.js              # CSV import/export logic
│   ├── steam.js            # Steam sync: callable wrapper + metadata listener
│   └── recommendations.js  # AI game recommendations (Cloud Function + local DeepSeek API fallback)
├── charts/
│   ├── setup.js            # Chart.js defaults, external tooltip factory, destroy helpers
│   ├── cost-distribution.js
│   ├── time-distribution.js
│   ├── game-sort.js
│   ├── game-distribution.js
│   └── monthly-trends.js
├── ui/
│   ├── auth.js             # Google Sign-In, admin check, read-only UI enforcement
│   ├── dashboard.js        # KPI calculations + tooltip content (top-10 lists)
│   ├── modals.js           # openModal/closeModal/showConfirmation
│   ├── item-form.js        # Add/edit item form, delete handler
│   ├── data-table.js       # Sortable/searchable item table in list modal
│   ├── play-next.js        # "What to play next?" modal with AI recommendations + API key settings
│   ├── fab.js              # Floating action button (import/export/add)
│   ├── csv-handlers.js     # Wires import/export buttons to csv service
│   ├── chart-controls.js   # Distribution chart time/price toggle, monthly hardware checkbox
│   └── on-this-day.js      # "On this day" historical purchases modal
└── main.js                 # Entry point: wires auth, Firestore listener, chart renders, all UI setup
```

**Data flow**: `firestore.js` listens to Firestore `items` collection via `onSnapshot`, writes items into `state.js` (the single source of truth), then fires an `onDataChange` callback. `main.js` sets up this callback to re-render all KPIs and charts. Everything downstream reads from `state.items`.

**Auth model**: Google Sign-In via Firebase Auth. Admin UIDs are hardcoded in `constants.js`. Non-admin users see read-only UI (FAB hidden, form buttons disabled). Admin users can add/edit/delete items, import/export CSV, and trigger Steam sync.

**Steam sync**: Cloud Function `syncSteamData` (callable, admin-only) fetches the user's Steam library via Web API, fuzzy-matches game names (exact → normalized → substring → Levenshtein), and binds `steam_app_id` to existing items. `scheduledSteamSync` runs daily at 4:00 AM CST. Per-item `steam_override` field (default `true`) controls whether Steam playtime overwrites local data. The sync also calls `ISteamUserStats/GetPlayerAchievements/v1` per matched game to auto-detect 100% achievement completion (`fullyCompleted`). Games with no achievements or API errors preserve their existing `fullyCompleted` value. The sync button and status display are in the header. Edit form has a Steam section with App ID input and override checkbox (visible when platform is `steam`).

**AI recommendations**: The "接下来" modal calls DeepSeek API (model `deepseek-v4-pro`) to analyze played/backlog games **and dramas** (剧集), then suggest what to play/watch next. Primary path: Firebase Cloud Function (`getAiRecommendations`). Fallback: direct DeepSeek API call from the browser (user must provide their own API key in settings). The Cloud Function prompt only covers games; the browser-side prompt also includes drama data.

## Key patterns

- **No framework**: All DOM manipulation is vanilla JS. Module state is shared via `js/core/state.js` getters/setters.
- **Chart lifecycle**: Charts are stored in `state.charts` keyed by name. `destroyAllCharts()` is called before re-rendering all charts. A lightweight hash of all items' key fields (`fb_id`, `playTime`, `purchasePrice`, `sellPrice`) skips chart re-renders when data hasn't actually changed. Individual chart renders also destroy their own previous instance before creating a new one (needed when charts re-render independently, e.g., distribution mode toggle).
- **Firestore doc shape**: Each item has `id`, `name`, `type`, `sort`, `status`, `purchaseDate`, `purchasePrice`, `from`, `playTime`, `passDate`, `sellDate`, `sellPrice`, `rating`, `episodeCount`, `episodeDuration`, `fullyCompleted` (boolean, 100% achievement). Steam items additionally have `steam_app_id` (number), `steam_override` (boolean, default true), `steam_last_sync` (timestamp). Firestore doc IDs are stored as `fb_id` on the client side. Drama items (`type: 'drama'`) use `episodeCount` × `episodeDuration` / 60 to auto-calculate `playTime`.
- **Achievement tracking**: `fullyCompleted` marks games with 100% achievements. Can be set manually via checkbox in the edit form (all game platforms), or auto-synced from Steam API during `syncSteamData`. The dashboard KPI card shows the count with a tooltip listing all fully-completed games. The data table has a sortable "全成就" column with trophy icons, and fully-completed rows have a gold border with pulse animation.
- **Metadata**: `metadata/dashboard` tracks `lastManualUpdate` for the "last updated" display. `metadata/steamSync` tracks `lastSyncTime`, `matchedCount`, `unmatchedCount`, `unmatchedGames`, `achievementsChecked`, `fullyCompletedCount` for Steam sync status.

## Standalone tools

```
tools/
├── bind_steam_ids/
│   └── bind_steam_ids.js        # Node.js: batch-bind Steam App IDs to Firestore items
├── cost_per_hour/
│   ├── cost_per_hour_trend.py   # Python: cost-per-hour trend chart from CSV export
│   └── cost_per_hour_trend.png
└── steam_info/
    ├── steam_info.py            # Python: fetch comprehensive Steam profile and library data
    ├── run.bat                  # Windows launcher (double-click to run)
    └── .env                     # STEAM_API_KEY (gitignored)
```

`cost_per_hour_trend.py` reads `game_cost_export_*.csv` from the project root, filters out hardware/drama/free/zero-playtime games, and generates a cumulative cost-per-hour curve. Uses matplotlib; no dependencies beyond Python 3 + matplotlib. Run with `python tools/cost_per_hour/cost_per_hour_trend.py`.

`bind_steam_ids.js` uses the Firebase REST API with an access token from `~/.config/configstore/firebase-tools.json` to PATCH `steam_app_id` onto existing Firestore items. Supports `--dry-run` for preview. Run with `node tools/bind_steam_ids/bind_steam_ids.js`.

`steam_info.py` calls 7 Steam Web API endpoints (player summary, owned games, recently played, level, badges, friends, bans) and writes one CSV per endpoint under `tools/steam_info/output/`. Reads `STEAM_API_KEY` from env var or `.env` file (gitignored). Defaults to project Steam ID; override with `--steamid`. Run with `python tools/steam_info/steam_info.py` or double-click `run.bat`.
