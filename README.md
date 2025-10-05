# 🎮 游戏数据仪表盘 - Game Data Dashboard

在这里**视奸**我的游戏记录吧：
Come **stalk** my gaming records here:

**最新云同步版 (Latest Cloud Version)**: [game-data-dashboard.web.app](https://game-data-dashboard.web.app) 或 (or) [netizen-dino.fun](https://netizen-dino.fun)

-----

本项目是一个开源的游戏数据仪表盘，旨在通过数据可视化来量化和分析您的整个游戏生涯。项目从一个纯粹的本地版本 (`index.html`) 发展而来，现在演进到了功能强大、由 Firebase 驱动的**云同步版 (`fb2.html`)**。

无论您是追求详尽数据分析的核心玩家，还是只想为自己的游戏收藏简单记个账，这个项目都能满足您的需求。

This project is an open-source game data dashboard designed to quantify and analyze your entire gaming career through data visualization. Evolving from a pure local version (`index.html`), it now features a powerful **cloud-synced version (`fb2.html`)** powered by Firebase.

Whether you're a core gamer seeking detailed data analysis or just want a simple ledger for your collection, this project has you covered.

## ✨ 云端版 (fb2.html)：您的终极游戏数据中心 ☁️

这是目前功能最完整、体验最佳的版本，推荐所有用户使用。它在早期版本的基础上，增加了更多深度分析和趣味功能，并使用 Google Firebase 作为强大的后端。

This is the most feature-complete and recommended version for all users. It builds upon earlier versions by adding more in-depth analysis and fun features, using Google Firebase as its powerful backend.

### 核心功能 (Core Features)

  - **🔐 Google账号一键登录**: 无需注册，安全便捷地访问您的数据。
  - **One-click Google Account Login**: No registration required for secure and convenient access to your data.
  - **🔄 数据实时云同步**: 所有记录保存在云端 Firestore，永不丢失，并能在任何设备上同步。
  - **Real-time Cloud Sync**: All records are saved in Firestore, ensuring no data loss and seamless syncing across all your devices.
  - **🎭 管理员与只读模式**: 可将自己的账号设为管理员，拥有写入权限；而其他访客则为只读模式，您可以放心地将链接分享给朋友！
  - **Admin & Read-only Modes**: Set your account as an admin with write permissions while other visitors have read-only access. Share your dashboard with friends securely\!
  - **📊 全方位数据可视化**: 通过 KPI 卡片、环形图、条形图和趋势图，直观展示消费、时间、平台分布、游戏类型偏好等信息。
  - **Comprehensive Visualization**: Intuitive KPIs, doughnut charts, bar charts, and trend graphs display your spending, playtime, platform distribution, genre preferences, and more.
  - **💡 特色探索功能**:
      - **那年今日 (On This Day)**: 回顾往年同期的游戏足迹。
      - **接下来玩 (Play Next)**: 通过 AI 分析您的游戏历史和待玩列表，为您提供个性化的游戏推荐！
  - **Fun Discovery Features**:
      - **On This Day**: Look back at your gaming activity from the same period in previous years.
      - **Play Next**: Get personalized game recommendations based on AI analysis of your gaming history and backlog\!
  - **⭐ 更精细的数据维度**:
      - **游戏状态**: 精确追踪游戏是“正在玩”、“待玩”、“已通关”还是“已弃坑”。
      - **个人评分**: 为您的游戏打分（1-5星），让数据更具个人色彩。
  - **More Granular Data**:
      - **Game Status**: Precisely track whether a game is "Playing," "Backlog," "Passed," or "Abandoned."
      - **Personal Rating**: Rate your games on a 1-5 star scale to add a personal touch to your data.
  - **📥 灵活的导入/导出**: 支持 CSV 格式的数据迁移和备份。
  - **Flexible Import/Export**: Supports data migration and backup in CSV format.

## 💻 纯净本地版 (index.html)：您的离线游戏秘书

对于注重隐私或希望完全离线使用的用户，我们保留了这个最纯粹的版本。所有数据都安全地存储在您自己的浏览器（LocalStorage）里，即开即用。

For users who prioritize privacy or prefer complete offline access, we've kept this pure version. All data is securely stored in your browser's LocalStorage, ready to use instantly.

### 特性 (Features)

  - **离线优先**: 无需联网，所有功能均可在本地运行。
  - **Offline First**: No internet connection required; all features run locally.
  - **核心统计功能**: 包含消费总览、时间总览、性价比分析等核心统计模块。
  - **Core Statistics**: Includes essential modules for spending, time, and cost-effectiveness analysis.
  - **基础增删改查与数据迁移**: 同样支持方便地管理记录和导入/导出CSV文件。
  - **Basic CRUD & Data Migration**: Easily manage your records and import/export CSV files.

**在线体验 (Live Demo)**: [https://tedi-dino.github.io/game-data-dashboard/](https://tedi-dino.github.io/game-data-dashboard/)

-----

## 🆚 版本对比与兼容性

| 功能 (Feature) | 本地版 (`index.html`) | Firebase v1 (`fb1.html`) | **Firebase v2 (`fb2.html`)** |
| :--- | :---: | :---: | :---: |
| 数据存储 | 浏览器 LocalStorage | 云端 Firestore | 云端 Firestore |
| 联网要求 | 离线可用 | **需要在线** | **需要在线** |
| 多设备同步 | ❌ | ✅ | ✅ |
| 用户认证 | ❌ | ✅ (Google) | ✅ (Google) |
| 共享与权限 | ❌ | ✅ (管理员/只读) | ✅ (管理员/只读) |
| 游戏状态 | ✅ (仅通关/未通关) | ✅ (仅通关/未通关) | ✅ (**四种状态**) |
| 游戏评分 | ❌ | ❌ | ✅ |
| "那年今日" | ❌ | ✅ | ✅ |
| "接下来玩" (AI) | ❌ | ❌ | ✅ |
| **CSV 兼容性** | 导入/导出标准13列表头 (含 `pass` 字段)。 | **完全兼容**本地版CSV。 | 导入/导出新的13列表头 (用 `status`, `rating` 替换了 `pass`, `short`)。<br>**不完全兼容旧版CSV**。 |

-----

## 📥 关于数据导入 (About Data Import)

为确保顺利导入，您的CSV文件**必须包含表头行**，且表头中**必须包含** `id`, `name`, 和 `type` 这三列。每一行的 `id` **必须是独一无二的**。

To ensure a successful import, your CSV file **must include a header row** containing at least the `id`, `name`, and `type` columns. Each `id` **must be unique**.

  - **本地版 / Firebase v1 的标准表头**:
    `id,name,short,type,sort,purchaseDate,purchasePrice,from,playTime,pass,passDate,sellDate,sellPrice`
  - **Firebase v2 的标准表头**:
    `id,name,type,sort,status,purchaseDate,purchasePrice,from,playTime,passDate,sellDate,sellPrice,rating`

**小贴士 (Tip):** 想要批量导入数据？最好的方法是先手动添加一条记录，然后**导出CSV**，以此作为您创建导入文件的完美模板！

**Pro-Tip:** The best way to batch-import data is to first add one record manually, then **export it as a CSV**. This gives you a perfect template to create your import file\!

### Steam API 高手提示 (Steam API Pro-Tip)

懒得手动输入成百上千个Steam游戏？您可以使用 **Steam Web API** 来程序化地获取您的游戏库列表和游玩时长，整理成符合要求的CSV文件后一键导入，能极大地节省您的时间！

Too lazy to enter hundreds of Steam games manually? You can use the **Steam Web API** to programmatically get your game library and playtimes, format it into a compatible CSV, and import it with one click. This will save you a ton of time\!

-----

## 🔧 如何自行部署云端版 (How to Self-Host the Cloud Version)

1.  **创建Firebase项目**: 前往 [Firebase 控制台](https://console.firebase.google.com/) 创建一个新项目 (免费的 Spark 套餐即可)。
2.  **创建Web应用**: 在项目设置中，点击 `</>` 图标创建一个Web应用，并复制生成的 `firebaseConfig` 对象。
3.  **启用服务**: 在控制台启用 **Firestore Database** 和 **Authentication**。在 Authentication 的 “Sign-in method” 标签页中，启用 **Google** 作为登录提供商。
4.  **配置代码**: 打开 `fb2.html` 文件，将第2步中复制的 `firebaseConfig` 粘贴到对应的位置。
5.  **成为管理员**:
    1.  部署或在本地打开配置好的 `fb2.html`，使用您的Google账号**登录一次**。
    2.  回到 Firebase 控制台的 `Authentication -> Users` 页面，找到您的账号并复制其 `UID`。
    3.  将复制的 `UID` 粘贴到文件顶部的 `ADMIN_UIDS` 数组里。
6.  **部署**: 将文件部署到 Firebase Hosting 或其他静态网站托管服务。大功告成！

-----

## ❗ 免责声明 (Disclaimer)

**郑重声明：代码不是我写的！**
**A Solemn Declaration: I didn't write the code\!**

本项目所有代码，包括HTML, CSS, 和 JavaScript，完全由 **Google 的 Gemini** 模型生成。包括这份 README 文档本身和界面上的可爱图标，也是AI的杰作！我本人对编程一窍不通，纯粹是出于兴趣，提供了一个想法和不断调试的耐心。

All code in this project, including HTML, CSS, and JavaScript, was entirely generated by **Google's Gemini** model. This README document itself, and the cute icons on the interface, are also masterpieces from the AI\! I, myself, am a complete novice in programming. This project was born purely out of interest, my contribution being the idea and the patience for continuous debugging.

> Co-Developed by Tedi-Dino & Gemini ❤️

因此，如果代码有任何bug、安全漏洞或改进建议，请不要问我...**去问AI吧！**
Therefore, if there are any bugs, security vulnerabilities, or suggestions for improvement in the code, please don't ask me... **go ask an AI\!**
