# 🎮 游戏数据仪表盘 - Game Data Dashboard

在这里**视奸**我的游戏记录吧：
Come **stalk** my gaming records here:

**最新云同步版 (Latest Cloud Version)**: [game-data-dashboard.web.app](https://game-data-dashboard.web.app) 或 (or) [netizen-dino.fun](https://netizen-dino.fun)

-----

本项目是一个开源的游戏数据仪表盘，旨在通过数据可视化来量化和分析您的整个游戏生涯。项目从一个纯粹的本地版本发展而来，现在演进到了功能强大、由 Firebase 驱动的**云同步版**，采用模块化架构，代码清晰易维护。

无论您是追求详尽数据分析的核心玩家，还是只想为自己的游戏收藏简单记个账，这个项目都能满足您的需求。

This project is an open-source game data dashboard designed to quantify and analyze your entire gaming career through data visualization. Evolving from a pure local version, it now features a powerful **cloud-synced version** powered by Firebase with a modular architecture for clean, maintainable code.

Whether you're a core gamer seeking detailed data analysis or just want a simple ledger for your collection, this project has you covered.

## ✨ 核心功能 (Core Features)

  - **🔐 Google账号一键登录**: 无需注册，安全便捷地访问您的数据。
  - **One-click Google Account Login**: No registration required for secure and convenient access to your data.
  - **🔄 数据实时云同步**: 所有记录保存在云端 Firestore，永不丢失，并能在任何设备上同步。
  - **Real-time Cloud Sync**: All records are saved in Firestore, ensuring no data loss and seamless syncing across all your devices.
  - **🎭 管理员与只读模式**: 可将自己的账号设为管理员，拥有写入权限；而其他访客则为只读模式，您可以放心地将链接分享给朋友！
  - **Admin & Read-only Modes**: Set your account as an admin with write permissions while other visitors have read-only access. Share your dashboard with friends securely\!
  - **📊 全方位数据可视化**: 通过 KPI 卡片、环形图、条形图和趋势图，直观展示消费、时间、平台分布、游戏类型偏好等信息。
  - **Comprehensive Visualization**: Intuitive KPIs, doughnut charts, bar charts, and trend graphs display your spending, playtime, platform distribution, genre preferences, and more.
  - **💡 特色探索功能**:
      - **那年今日 (On This Day)**: 回顾往年同期的游戏足迹，看看历史上的今天你沉迷于哪款大作。
      - **接下来玩 (Play Next)**: **独家AI推荐功能！** 它会分析您最近（3个月内）通关的游戏、评分和您的待玩列表（Backlog），通过云函数调用大语言模型，为您提供个性化的游戏推荐理由，帮助您解决"游戏荒"的烦恼。
  - **Fun Discovery Features**:
      - **On This Day**: Look back at your gaming activity from the same period in previous years.
      - **Play Next**: **Exclusive AI Recommendation\!** This feature analyzes your recently completed games (within the last 3 months), your ratings, and your current backlog. It then calls a Large Language Model via a cloud function to provide personalized recommendations and reasons, helping you decide what to play next.
  - **⭐ 更精细的数据维度**:
      - **游戏状态 (Status)**: 精确追踪游戏是"正在玩"、"待玩"、"已通关"还是"已弃坑"。
      - **个人评分 (Rating)**: 为您的游戏打分（1-5星），让数据更具个人色彩，并用于AI推荐分析。
  - **More Granular Data**:
      - **Game Status**: Precisely track whether a game is "Playing," "Backlog," "Passed," or "Abandoned."
      - **Personal Rating**: Rate your games on a 1-5 star scale to add a personal touch to your data and feed the AI recommendation engine.
  - **🎭 剧集追踪 (Drama Tracking)**: 除了游戏，还可以追踪您观看的剧集，自动计算观看时长。
  - **📥 灵活的导入/导出**: 支持 CSV 格式的数据迁移和备份。
  - **Flexible Import/Export**: Supports data migration and backup in CSV format.

-----

## 🏗️ 项目架构 (Project Architecture)

项目采用模块化架构，零构建、纯原生 JavaScript ES 模块：

```
js/
├── config/
│   ├── firebase.js          # Firebase 初始化
│   └── constants.js          # 管理员UID、平台颜色、类型映射等
├── core/
│   ├── state.js              # 中心化状态管理
│   └── utils.js              # 格式化工具（货币、日期、评分等）
├── services/
│   ├── firestore.js          # Firestore 实时监听、CRUD 操作
│   ├── csv.js                # CSV 导入/导出
│   └── recommendations.js    # AI 游戏推荐（云函数 + DeepSeek 备用）
├── charts/
│   ├── setup.js              # Chart.js 配置
│   ├── cost-distribution.js  # 成本分布图
│   ├── time-distribution.js  # 时间分布图
│   ├── game-sort.js          # 游戏排序图
│   ├── game-distribution.js  # 游戏分布图
│   └── monthly-trends.js     # 月度趋势图
├── ui/
│   ├── auth.js               # 登录/权限控制
│   ├── dashboard.js          # KPI 计算与展示
│   ├── modals.js             # 弹窗管理
│   ├── item-form.js          # 添加/编辑表单
│   ├── data-table.js         # 数据表格
│   ├── play-next.js          # AI 推荐弹窗
│   ├── fab.js                # 浮动操作按钮
│   ├── csv-handlers.js       # CSV 按钮事件
│   ├── chart-controls.js     # 图表控制
│   └── on-this-day.js        # "那年今日"弹窗
└── main.js                   # 入口文件
```

**数据流**: Firestore `onSnapshot` → `state.js`（单一数据源）→ KPI/图表渲染

**Data Flow**: Firestore `onSnapshot` → `state.js` (single source of truth) → KPI/chart rendering

-----

## 🧐 数据是如何计算的？(How is the data calculated?)

仪表盘中的一些核心图表和指标背后有特定的计算逻辑，了解它们能帮助您更好地解读数据：

  - **单位时间价格 (Cost Per Hour)**

      - **计算公式**: `(购入价格 - 售出价格) / 游玩时长`
      - **说明**: 这是衡量一款游戏"性价比"的核心指标。它计算了您在游戏上每花费1元钱能玩多久。在计算**总平均值**时，`免费`或`赠送`来源的游戏会被排除，以避免数据失真。

  - **月度消费与时间统计图 (Monthly Trends Chart)**

      - **类型**: 这是一个复合图表，消费按平台堆叠成柱状图，游玩时长则是一条独立的折线图。
      - **时间分配逻辑**: 这是图表最复杂的部分。为了更真实地反映您在某个时间段内的投入，游玩时长的分配逻辑如下：
        1.  **对于已通关且有明确通关日期的游戏**: 程序的假设是您的游玩过程均匀地分布在从`购入日期`到`通关日期`的每一天。总时长会被平分到这个区间的每个月中。
        2.  **对于其他情况**（如未通关、正在玩、或无通关日期）：程序会将该游戏的**全部游玩时长**归因到其`购入日期`所在的月份。

  - **未通关游戏价值 (Unfinished Games Cost)**

      - **计算公式**: `Σ (所有状态不为 "已通关" 的游戏的实际支出)`
      - **说明**: 这个指标统计了您所有"坑"起来的游戏的总价值，是"待玩列表 (Backlog)"经济价值的直观体现。

  - **AI 推荐 (Play Next Recommendations)**

      - **工作流程**: 当您点击"接下来玩"时，应用会整理您最近3个月内通关的游戏（包括名称、时长、评分）和您当前所有状态为"待玩"的游戏列表。
      - **后端处理**: 这些信息会被发送到 Firebase Cloud Function，该函数会调用一个大语言模型（如 DeepSeek），并给出一个结构化的指令，要求模型基于您的近期偏好，从待玩列表中推荐几款游戏并说明理由。

-----

## 📥 关于数据导入 (About Data Import)

为确保顺利导入，您的CSV文件**必须包含表头行**，且表头中**必须包含** `id`, `name`, 和 `type` 这三列。每一行的 `id` **必须是独一无二的**。

**标准表头**:
`id,name,type,sort,status,purchaseDate,purchasePrice,from,playTime,passDate,sellDate,sellPrice,rating`

**剧集额外字段**: `episodeCount`, `episodeDuration`（每集时长，分钟）

**小贴士 (Tip):** 想要批量导入数据？最好的方法是先手动添加一条记录，然后**导出CSV**，以此作为您创建导入文件的完美模板！

**Pro-Tip:** The best way to batch-import data is to first add one record manually, then **export it as a CSV**. This gives you a perfect template to create your import file\!

### Steam API 高手提示 (Steam API Pro-Tip)

懒得手动输入成百上千个Steam游戏？您可以使用 **Steam Web API** 来程序化地获取您的游戏库列表和游玩时长，整理成符合要求的CSV文件后一键导入，能极大地节省您的时间！

Too lazy to enter hundreds of Steam games manually? You can use the **Steam Web API** to programmatically get your game library and playtimes, format it into a compatible CSV, and import it with one click. This will save you a ton of time\!

-----

## 🔧 如何自行部署 (How to Self-Host)

**⚠️ 安全提示：** 以下步骤中的代码片段包含了您项目的敏感凭证。**请勿将填写有真实凭证的文件直接上传到公开的 Git 仓库。** 建议使用环境变量或 Firebase App Check 来保护您的应用。

1.  **创建Firebase项目**: 前往 [Firebase 控制台](https://console.firebase.google.com/) 创建一个新项目 (免费的 Spark 套餐即可)。

2.  **创建Web应用**: 在项目设置中，点击 `</>` 图标创建一个Web应用，并复制生成的 `firebaseConfig` 对象。

3.  **启用服务**: 在控制台启用 **Firestore Database** 和 **Authentication**。在 Authentication 的 "Sign-in method" 标签页中，启用 **Google** 作为登录提供商。如果您想使用AI推荐功能，还需启用 **Functions**。

4.  **配置代码**: 打开 `js/config/firebase.js` 文件，将第2步中复制的 `firebaseConfig` 粘贴到对应的位置。

5.  **成为管理员**:

    1.  部署或在本地打开应用，使用您的Google账号**登录一次**。
    2.  回到 Firebase 控制台的 `Authentication -> Users` 页面，找到您的账号并复制其 `UID`。
    3.  将复制的 `UID` 粘贴到 `js/config/constants.js` 的 `ADMIN_UIDS` 数组里。

6.  **部署**: 使用 Firebase CLI 部署：

    ```bash
    firebase deploy
    ```

-----

## ❗ 免责声明 (Disclaimer)

**郑重声明：代码不是我写的！**
**A Solemn Declaration: I didn't write the code\!**

本项目所有代码，包括HTML, CSS, 和 JavaScript，完全由 **Google 的 Gemini** 模型生成。包括这份 README 文档本身和界面上的可爱图标，也是AI的杰作！我本人对编程一窍不通，纯粹是出于兴趣，提供了一个想法和不断调试的耐心。

All code in this project, including HTML, CSS, and JavaScript, was entirely generated by **Google's Gemini** model. This README document itself, and the cute icons on the interface, are also masterpieces from the AI\! I, myself, am a complete novice in programming. This project was born purely out of interest, my contribution being the idea and the patience for continuous debugging.

> Co-Developed by Tedi-Dino & Gemini ❤️

因此，如果代码有任何bug、安全漏洞或改进建议，请不要问我...**去问AI吧！**
Therefore, if there are any bugs, security vulnerabilities, or suggestions for improvement in the code, please don't ask me... **go ask an AI\!**
