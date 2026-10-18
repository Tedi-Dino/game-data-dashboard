[中文](./README.md)

# 🎮 Game Data Dashboard

Come **stalk** my gaming records here:

**Live site (Firebase Spark / free plan)**: [game-data-dashboard.web.app](https://game-data-dashboard.web.app)

> **Plan positioning (since 2026-10-18)**: this project runs on Firebase's **Spark
> (free) plan** long-term. The free tier is the mainline; Blaze (paid) is kept only
> as an optional branch. See "Free-tier boundaries" below.

-----

This project is an open-source game data dashboard designed to quantify and analyze your entire gaming career through data visualization. Evolving from a pure local version, it now runs as a Firebase-backed online dashboard with a modular architecture for clean, maintainable code.

Whether you're a core gamer seeking detailed data analysis or just want a simple ledger for your collection, this project has you covered.

## 🤖 Working with Codex

This repository has migrated from Claude Code to **Codex** as the primary AI-assisted development environment. Codex-facing project conventions, architecture notes, data rules, and common commands are maintained in **[AGENTS.md](AGENTS.md)**.

If you plan to modify this repository with Codex, read `AGENTS.md` first. The historical `CLAUDE.md` file is kept only as pre-migration context and is no longer the main agent guide.

## ✨ Core Features

- **🔐 One-click Google Account Login** — No registration required for secure and convenient access to your data.
- **🔄 Real-time Cloud Sync** — All records are saved in Firestore, ensuring no data loss and seamless syncing across all your devices.
- **🎭 Admin & Read-only Modes** — Set your account as an admin with write permissions while other visitors have read-only access. Share your dashboard with friends securely!
- **📊 Comprehensive Visualization** — Intuitive KPIs, doughnut charts, bar charts, and trend graphs display your spending, playtime, platform distribution, genre preferences, and more.
- **💡 Fun Discovery Features**:
  - **On This Day** — Look back at your gaming activity from the same period in previous years.
  - **Play Next** — Lists your backlog; admins also get AI recommendations (on the free plan the browser calls DeepSeek with your own API key — visitors don't see that panel).
- **⭐ More Granular Data**:
  - **Game Status** — Precisely track whether a game is "Playing," "Backlog," "Passed," or "Abandoned."
  - **Personal Rating** — Rate your games on a 1-10 scale (half-star support) to add a personal touch to your data and feed the AI recommendation engine.
  - **🏆 Achievement Tracking** — Mark games with 100% achievements. Steam games are auto-detected by the local sync script; other platforms use a manual toggle. Fully-completed rows in the data table are highlighted with a gold border and pulse animation.
- **🎭 Drama Tracking** — Besides games, also track TV dramas you've watched with automatic duration calculation.
- **📥 Flexible Import/Export** — Supports data migration and backup in CSV format.

-----

## 🆓 Free-tier boundaries

The site runs on the Spark plan. Every difference is collapsed into the `FEATURES` switch in `js/config/constants.js`:

| Capability | Free plan (current) | Requires Blaze |
| --- | --- | --- |
| Hosting / custom domain | ✅ | — |
| Google sign-in | ✅ | — |
| Firestore realtime sync (50k reads / 20k writes per day) | ✅ | — |
| Charts, KPIs, CSV import/export | ✅ | — |
| Steam sync | 🖥️ local `tools/steam_sync/sync.mjs` + Task Scheduler | ☁️ in-page button + daily 04:00 cloud job |
| AI recommendations | 🖥️ browser → DeepSeek, key stored locally, admin only | ☁️ Cloud Function holds the key (still admin-only in the UI) |
| App Check | ❌ disabled (reCAPTCHA tokens never resolve on mainland networks) | ⚠️ verify tokens first |

Nothing unclickable is left on the page: the Steam sync button is hidden on the free plan, and the AI panel is hidden from visitors (the backlog list stays).

-----

## 🏗️ Project Architecture

Modular architecture, zero-build, vanilla JavaScript ES modules:

```
js/
├── config/
│   ├── firebase.js          # Firebase init (App Check behind a switch)
│   └── constants.js          # Admin UIDs, FEATURES switches, platform colors, type maps
├── core/
│   ├── cache.js              # IndexedDB cache for instant first paint
│   ├── state.js              # Centralized state management
│   └── utils.js              # Formatters (currency, dates, ratings, etc.)
├── services/
│   ├── firestore.js          # Firestore real-time listener, CRUD operations
│   ├── csv.js                # CSV import/export
│   ├── csv-parse.js          # CSV parsing (pure, unit-tested)
│   ├── steam.js              # Steam sync entry (free plan: status display only)
│   ├── steam-playtime.js     # Steam playtime delta listeners
│   ├── recommendations.js    # AI recommendations (free plan: direct DeepSeek)
│   └── recommendation-parse.js  # Recommendation JSON parser (pure, unit-tested)
├── charts/
│   ├── setup.js              # Chart.js configuration
│   ├── cost-distribution.js  # Cost distribution chart
│   ├── time-distribution.js  # Time distribution chart
│   ├── game-sort.js          # Game sorting chart
│   ├── game-distribution.js  # Game distribution chart
│   └── monthly-trends.js     # Monthly trends chart
├── ui/
│   ├── auth.js               # Login / permission control
│   ├── dashboard.js          # KPI calculation & display
│   ├── modals.js             # Modal management
│   ├── item-form.js          # Add/edit form
│   ├── data-table.js         # Data table
│   ├── play-next.js          # AI recommendation modal
│   ├── fab.js                # Floating action button
│   ├── csv-handlers.js       # CSV button handlers
│   ├── chart-controls.js     # Chart controls
│   └── on-this-day.js        # "On This Day" modal
└── main.js                   # Entry point
```

**Data Flow**: Firestore `onSnapshot` → `state.js` (single source of truth) → KPI/chart rendering

-----

## 🎨 Design System

The dashboard uses a **warm, low-saturation palette** built on Tailwind Stone (`#f5f0ed` background) with Amber accent. All platform colors are desaturated 30-40% from their brand originals and warmed to blend with the page atmosphere.

Trend lines use smooth curves without data point markers; the scatter chart's light amber gradient hints at the cost-performance sweet spot. See **[design.md](design.md)** for the full color rationale and swatch table.

-----

## 🧐 How is the data calculated?

Some core charts and metrics have specific calculation logic behind them:

- **Cost Per Hour**
  - **Formula**: `(Purchase Price - Sell Price) / Playtime`
  - **Description**: The core "value for money" metric — how many hours of gameplay you get per unit of currency. When calculating the **overall average**, games from `Free` or `Gift` sources are excluded to avoid data distortion.

- **Monthly Trends Chart**
  - **Type**: Compound chart — spending stacked by platform as a bar chart, with playtime as a separate line chart.
  - **Time Allocation Logic**:
    1. For completed games with a clear pass date: playtime is assumed to be evenly distributed from `purchase date` to `pass date`, split proportionally across each month.
    2. For all other cases (unfinished, playing, no pass date): the **entire playtime** is attributed to the month of the `purchase date`.

- **Unfinished Games Cost**
  - **Formula**: `Σ (actual spending on all games not in "Passed" status)`
  - **Description**: The total value of all games sitting in your backlog — a直观 representation of your backlog's economic value.

- **AI Recommendations**
  - **Workflow**: When you click "Play Next," the app gathers your recently completed games (within 3 months, including name, playtime, and rating) and all games in your "Backlog" status.
  - **Backend**: On the free plan the browser calls DeepSeek directly with the admin's own API key, so the panel is admin-only. On Blaze the same prompt goes through a Cloud Function that holds the key server-side.

-----

## 📥 About Data Import

To ensure a smooth import, your CSV file **must contain a header row** and **must include** `id`, `name`, and `type` columns. Each row's `id` **must be unique**.

**Standard Header**:
`id,name,type,sort,status,purchaseDate,purchasePrice,from,playTime,passDate,sellDate,sellPrice,rating,fullyCompleted`

**Drama Extra Fields**: `episodeCount`, `episodeDuration` (minutes per episode)

**Pro-Tip:** The best way to batch-import data is to first add one record manually, then **export it as a CSV**. This gives you a perfect template to create your import file!

### Steam API Pro-Tip

Too lazy to enter hundreds of Steam games manually? You can use the **Steam Web API** to programmatically get your game library and playtimes, format it into a compatible CSV, and import it with one click. This will save you a ton of time!

-----

## 🔧 How to Self-Host

**⚠️ Security Notice:** The code snippets below contain sensitive credentials for your project. **Do NOT upload files with real credentials to a public Git repository.** Consider using environment variables or Firebase App Check to protect your application.

1. **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (the free Spark plan is sufficient).

2. **Create a Web App**: In Project Settings, click the `</>` icon to create a web app, and copy the generated `firebaseConfig` object.

3. **Enable Services**: Enable **Firestore Database** and **Authentication** in the console. Under Authentication's "Sign-in method" tab, enable **Google** as a sign-in provider. AI recommendations call DeepSeek from the browser on the free plan, so **Functions are not required**.

4. **Configure the Code**: Open `js/config/firebase.js` and paste the `firebaseConfig` from Step 2 into the designated spot.

5. **Become an Admin**:
   1. Deploy or open the app locally, and **sign in once** with your Google account.
   2. Go to the Firebase Console's `Authentication -> Users` page, find your account and copy its `UID`.
   3. Paste the `UID` into the `ADMIN_UIDS` array in `js/config/constants.js`.

6. **Deploy**: Use the Firebase CLI (the free-plan `firebase.json` has no `functions` block):
   ```bash
   firebase deploy --only hosting,firestore:rules
   firebase deploy --only hosting   # routine releases
   ```

   > ⚠️ `firebase.json` includes `firestore.rules` in the deploy, so a bare
   > `firebase deploy` overwrites the live security rules with whatever is
   > committed here. Deploy rules deliberately via
   > `firebase deploy --only firestore:rules`.

   > ℹ️ The admin UID must stay identical in `firestore.rules`,
   > `functions/index.js` and `js/config/constants.js`.
   > `node --test tools/tests/*.test.mjs` verifies this automatically.

7. **Steam sync (free plan)**: Cloud Scheduler is unavailable, so run it locally:
   ```bash
   node tools/steam_sync/sync.mjs           # dry-run
   node tools/steam_sync/sync.mjs --apply   # write to Firestore
   ```
   Set `STEAM_API_KEY` in `tools/steam_sync/.env`, then schedule it daily at 04:00 with Windows Task Scheduler. See `docs/free-tier-plan.md`.

> 💡 **Optional: back to Blaze (paid)** — not the default path. Restore
> `"functions": { "source": "functions" }` in `firebase.json`, flip the `FEATURES`
> switches, re-set both secrets, and disable the local scheduled task. No frontend
> edits are needed: the Steam sync button and cloud AI mode reappear with the switch.

-----

## ❗ Project Origin

**A Solemn Declaration: I didn't write the code!**

The project was originally generated by **Google Gemini 2.5 Pro**'s web Canvas feature as a single ~1700-line HTML file — all logic, styles, and structure crammed into one file. It worked, but maintaining it was a nightmare.

**MIMO V2.5 Pro** and **DeepSeek V4 Pro** then took over, refactoring the monolithic file into a modular architecture (32 files, ~3900 lines), continuously adding features, fixing bugs, and improving the experience. Day-to-day AI-assisted development has now migrated to **Codex**, with agent instructions maintained in `AGENTS.md`.

> Co-Developed by Tedi-Dino, Gemini, MIMO, DeepSeek & Codex ❤️

I, myself, am a complete novice in programming. This project was born purely out of interest, my contribution being the idea and the patience for continuous debugging.

Therefore, if there are any bugs, security vulnerabilities, or suggestions for improvement in the code, please don't ask me... **go ask an AI!**
