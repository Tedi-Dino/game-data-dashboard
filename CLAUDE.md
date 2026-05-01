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

The Firebase Cloud Function at `index.js` (project root) must be deployed separately via `firebase deploy --only functions`. The `functions/` directory is empty; the function source lives at the repo root as `index.js`.

## Architecture

```
js/
├── config/
│   ├── firebase.js        # Firebase app/auth/firestore/functions init
│   └── constants.js        # Admin UIDs, platform colors, type/status maps, chart range configs
├── core/
│   ├── state.js            # Centralized mutable state: items[], sortConfig, charts{}, etc.
│   └── utils.js            # Formatters (currency, dates, stars), hash utility
├── services/
│   ├── firestore.js        # Firestore onSnapshot listener, CRUD helpers, bulk CSV replace
│   ├── csv.js              # CSV import/export logic
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

**Auth model**: Google Sign-In via Firebase Auth. Admin UIDs are hardcoded in `constants.js`. Non-admin users see read-only UI (FAB hidden, form buttons disabled). Admin users can add/edit/delete items and import/export CSV.

**AI recommendations**: The "接下来玩" modal calls DeepSeek API (model `deepseek-v4-pro`) to analyze played/backlog games and suggest what to play next. Primary path: Firebase Cloud Function (`getAiRecommendations`). Fallback: direct DeepSeek API call from the browser (user must provide their own API key in settings).

## Key patterns

- **No framework**: All DOM manipulation is vanilla JS. Module state is shared via `js/core/state.js` getters/setters.
- **Chart lifecycle**: Charts are stored in `state.charts` keyed by name. `destroyAllCharts()` is called before every re-render to prevent memory leaks. Individual chart modules render into specific `<canvas>` elements.
- **Firestore doc shape**: Each item has `id`, `name`, `type`, `sort`, `status`, `purchaseDate`, `purchasePrice`, `from`, `playTime`, `passDate`, `sellDate`, `sellPrice`, `rating`. Firestore doc IDs are stored as `fb_id` on the client side.
- **Metadata**: A separate Firestore doc at `metadata/dashboard` tracks `lastManualUpdate` for the "last updated" display.
