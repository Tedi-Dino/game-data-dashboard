[中文](./README.md)

# 🎮 Game Data Dashboard

Come **stalk** my gaming records here:

**Latest Cloud Version**: [game-data-dashboard.web.app](https://game-data-dashboard.web.app) or [netizen-dino.fun](https://netizen-dino.fun)

-----

This project is an open-source game data dashboard designed to quantify and analyze your entire gaming career through data visualization. Evolving from a pure local version, it now features a powerful **cloud-synced version** powered by Firebase with a modular architecture for clean, maintainable code.

Whether you're a core gamer seeking detailed data analysis or just want a simple ledger for your collection, this project has you covered.

## ✨ Core Features

- **🔐 One-click Google Account Login** — No registration required for secure and convenient access to your data.
- **🔄 Real-time Cloud Sync** — All records are saved in Firestore, ensuring no data loss and seamless syncing across all your devices.
- **🎭 Admin & Read-only Modes** — Set your account as an admin with write permissions while other visitors have read-only access. Share your dashboard with friends securely!
- **📊 Comprehensive Visualization** — Intuitive KPIs, doughnut charts, bar charts, and trend graphs display your spending, playtime, platform distribution, genre preferences, and more.
- **💡 Fun Discovery Features**:
  - **On This Day** — Look back at your gaming activity from the same period in previous years.
  - **Play Next** — **Exclusive AI Recommendation!** Analyzes your recently completed games (within the last 3 months), your ratings, and your current backlog. Calls a Large Language Model via a cloud function to provide personalized recommendations and reasons, helping you decide what to play next.
- **⭐ More Granular Data**:
  - **Game Status** — Precisely track whether a game is "Playing," "Backlog," "Passed," or "Abandoned."
  - **Personal Rating** — Rate your games on a 1-10 scale (half-star support) to add a personal touch to your data and feed the AI recommendation engine.
- **🎭 Drama Tracking** — Besides games, also track TV dramas you've watched with automatic duration calculation.
- **📥 Flexible Import/Export** — Supports data migration and backup in CSV format.

-----

## 🏗️ Project Architecture

Modular architecture, zero-build, vanilla JavaScript ES modules:

```
js/
├── config/
│   ├── firebase.js          # Firebase initialization
│   └── constants.js          # Admin UIDs, platform colors, type maps, etc.
├── core/
│   ├── state.js              # Centralized state management
│   └── utils.js              # Formatters (currency, dates, ratings, etc.)
├── services/
│   ├── firestore.js          # Firestore real-time listener, CRUD operations
│   ├── csv.js                # CSV import/export
│   └── recommendations.js    # AI game recommendations (Cloud Function + DeepSeek fallback)
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
  - **Backend**: This info is sent to a Firebase Cloud Function, which calls a Large Language Model (DeepSeek) with a structured prompt to recommend games from your backlog based on your recent preferences.

-----

## 📥 About Data Import

To ensure a smooth import, your CSV file **must contain a header row** and **must include** `id`, `name`, and `type` columns. Each row's `id` **must be unique**.

**Standard Header**:
`id,name,type,sort,status,purchaseDate,purchasePrice,from,playTime,passDate,sellDate,sellPrice,rating`

**Drama Extra Fields**: `episodeCount`, `episodeDuration` (minutes per episode)

**Pro-Tip:** The best way to batch-import data is to first add one record manually, then **export it as a CSV**. This gives you a perfect template to create your import file!

### Steam API Pro-Tip

Too lazy to enter hundreds of Steam games manually? You can use the **Steam Web API** to programmatically get your game library and playtimes, format it into a compatible CSV, and import it with one click. This will save you a ton of time!

-----

## 🔧 How to Self-Host

**⚠️ Security Notice:** The code snippets below contain sensitive credentials for your project. **Do NOT upload files with real credentials to a public Git repository.** Consider using environment variables or Firebase App Check to protect your application.

1. **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (the free Spark plan is sufficient).

2. **Create a Web App**: In Project Settings, click the `</>` icon to create a web app, and copy the generated `firebaseConfig` object.

3. **Enable Services**: Enable **Firestore Database** and **Authentication** in the console. Under Authentication's "Sign-in method" tab, enable **Google** as a sign-in provider. If you want AI recommendations, also enable **Functions**.

4. **Configure the Code**: Open `js/config/firebase.js` and paste the `firebaseConfig` from Step 2 into the designated spot.

5. **Become an Admin**:
   1. Deploy or open the app locally, and **sign in once** with your Google account.
   2. Go to the Firebase Console's `Authentication -> Users` page, find your account and copy its `UID`.
   3. Paste the `UID` into the `ADMIN_UIDS` array in `js/config/constants.js`.

6. **Deploy**: Use the Firebase CLI to deploy:
   ```bash
   firebase deploy
   ```

-----

## ❗ Project Origin

**A Solemn Declaration: I didn't write the code!**

The project was originally generated by **Google Gemini 2.5 Pro**'s web Canvas feature as a single ~1700-line HTML file — all logic, styles, and structure crammed into one file. It worked, but maintaining it was a nightmare.

**MIMO V2.5 Pro** and **DeepSeek V4 Pro** then took over, refactoring the monolithic file into a modular architecture (32 files, ~3900 lines), continuously adding features, fixing bugs, and improving the experience. The project is currently maintained collaboratively by these two models.

> Co-Developed by Tedi-Dino, Gemini, MIMO & DeepSeek ❤️

I, myself, am a complete novice in programming. This project was born purely out of interest, my contribution being the idea and the patience for continuous debugging.

Therefore, if there are any bugs, security vulnerabilities, or suggestions for improvement in the code, please don't ask me... **go ask an AI!**
