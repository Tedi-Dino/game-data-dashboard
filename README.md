# 🎮 游戏数据仪表盘 - Game Data Dashboard

来这里**视奸**我的游戏记录吧：
Come **stalk** my gaming records here:

**云同步版 (Cloud Version)**: [game-data-dashboard.web.app](https://game-data-dashboard.web.app) 或 (or) [netizen-dino.fun](https://netizen-dino.fun)


本项目是一个开源的游戏数据仪表盘，旨在量化你的游戏生涯。它有两个版本：功能强大的 **Firebase 云同步版**，使用Google账号登录，数据实时同步，可以安全地分享给朋友围观；以及一个极其纯粹的**纯净本地版** (`index.html`)，所有数据仅保存在你的浏览器中，完全离线，即开即用。无论你是数据控还是只想简单记个账，总有一款适合你。

This project is an open-source game data dashboard designed to quantify your gaming career. It comes in two versions: a powerful **Firebase cloud-synced version** that uses Google accounts for login, syncs data in real-time, and can be safely shared for friends to spectate; and an extremely pure **purely local version** (`index.html`), where all data is saved only in your browser, works completely offline, and is ready to use instantly. Whether you're a data enthusiast or just want a simple ledger, there's a version for you.

-----

## `index.html` - 纯净本地版：你的私人游戏秘书 💻

## `index.html` - The Pure Local Version: Your Private Gaming Secretary 💻

这是最纯粹、最简单的版本。所有数据都安全地存储在你自己的浏览器（LocalStorage）里，无需联网，即开即用！
This is the purest and simplest version. All your data is securely stored in your own browser (using LocalStorage), no internet connection required, ready to use right out of the box\!

### ✨ 特性 (Features)

  - **多维度数据统计**: 消费总览、时间总览、性价比分析等一应俱全。
  - **Multi-dimensional Statistics**: Comprehensive overviews of spending, time, cost-effectiveness, and more.
  - **数据可视化**: 通过多种图表（饼图、条形图）直观展示你的消费分布、时间分配和游戏类型偏好。
  - **Data Visualization**: Intuitive charts (doughnuts, bars) display your spending distribution, time allocation, and favorite game genres.
  - **增删改查**: 方便地添加、编辑、删除你的游戏或硬件记录。
  - **CRUD Operations**: Easily add, edit, and delete your game or hardware records.
  - **导入/导出**: 支持CSV格式的数据导入和导出，方便迁移和备份。
  - **Import/Export**: Supports data import and export in CSV format for easy migration and backup.

### 🚀 如何使用 (How to Use)

1.  直接下载仓库中的 `index.html` 文件。
    Simply download the `index.html` file from the repository.
2.  用你的浏览器（推荐Chrome或Edge）打开它。
    Open it with your browser (Chrome or Edge is recommended).
3.  开始记录你的游戏吧！就是这么简单！
    Start logging your games\! It's that easy\!
4.  或者，你也可以直接访问我们的 GitHub Pages 链接来体验：[https://tedi-dino.github.io/game-data-dashboard/](https://tedi-dino.github.io/game-data-dashboard/)
    Alternatively, you can try it out directly by visiting our GitHub Pages link: [https://tedi-dino.github.io/game-data-dashboard/](https://tedi-dino.github.io/game-data-dashboard/)

-----

## Firebase版：你的云端游戏金库 ☁️

## The Firebase Version: Your Gaming Vault in the Cloud ☁️

想要在任何设备上访问你的数据吗？想要和朋友分享你的游戏成就（或者“忏悔”清单）吗？Firebase版就是为你准备的！
Want to access your data from any device? Want to share your gaming achievements (or your "list of shame") with friends? The Firebase version is for you\!

它使用 Google Firebase 作为强大的后端，在本地版所有功能的基础上，增加了以下酷炫功能：
It uses Google Firebase as a powerful backend, adding the following cool features on top of everything the local version offers:

### ✨ 新增特性 (New Features)

  - **Google账号登录**: 一键使用你的Google账号登录，无需注册。
  - **Google Account Login**: One-click sign-in with your Google account, no registration needed.
  - **数据云同步**: 所有数据实时保存在云端（Firestore），永不丢失，多设备同步。
  - **Cloud Data Sync**: All data is saved in the cloud (Firestore) in real-time, never get lost, and syncs across multiple devices.
  - **管理员模式**: 设置你自己的账号为管理员，拥有写入（增删改）权限，而其他访客则为只读模式，可以安全地分享你的仪表盘给朋友看！
  - **Admin Mode**: Set your own account as the administrator with write access (add, delete, modify), while other visitors are in read-only mode. Share your dashboard with friends securely\!

### 🔧 如何配置 (How to Set Up)

1.  **创建Firebase项目**: 前往 [Firebase 控制台](https://console.firebase.google.com/) 创建一个新项目。免费的“Spark”套餐就够用了！
    **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project. The free "Spark" plan is sufficient\!
2.  **创建Web应用**: 在你的项目设置中，点击 `</>` 图标来创建一个新的Web应用，并记下生成的 `firebaseConfig` 对象。
    **Create a Web App**: In your project settings, click the `</>` icon to create a new Web App and copy the generated `firebaseConfig` object.
3.  **启用服务**: 在控制台左侧菜单中，启用 **Firestore Database** (使用默认安全规则即可开始) 和 **Authentication**。在 Authentication 的 “Sign-in method” 标签页中，启用 **Google** 作为登录提供商。
    **Enable Services**: In the console menu, enable **Firestore Database** (start with default security rules) and **Authentication**. In the "Sign-in method" tab of Authentication, enable **Google** as a provider.
4.  **填写配置**: 打开 `fb.html` 文件，将第2步中复制的 `firebaseConfig` 对象粘贴到对应的位置。
    **Fill in the Configuration**: Open the `fb.html` file and paste the `firebaseConfig` object you copied in step 2 into the designated placeholder.
    ```javascript
    //...
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY", // 粘贴你的配置
        authDomain: "YOUR_AUTH_DOMAIN", // Paste your config here
        projectId: "YOUR_PROJECT_ID",
        // ...
    };
    //...
    ```
5.  **成为管理员**: 部署或在本地打开 `fb.html`，使用你的Google账号**登录一次**。然后回到 Firebase 控制台的 Authentication -\> Users 页面，找到你的账号对应的 `UID` 并复制它。
    **Become an Admin**: Deploy or open `fb.html` locally and **sign in once** with your Google account. Then, go back to the Authentication -\> Users page in your Firebase Console, find the `UID` corresponding to your account, and copy it.
6.  **设置管理员UID**: 将你复制的 `UID` 粘贴到 `fb.html` 文件顶部的 `ADMIN_UIDS` 数组里。
    **Set Admin UID**: Paste your copied `UID` into the `ADMIN_UIDS` array at the top of the `fb.html` file.
    ```javascript
    //...
    const ADMIN_UIDS = ['YOUR_ADMIN_UID_HERE']; // <-- 替换成你自己的UID
    //...
    ```
7.  **部署**: 部署这个配置好的 `fb.html` 文件到 Firebase Hosting 或其他任何静态网站托管服务上。大功告成！
    **Deploy**: Deploy the configured `fb.html` file to Firebase Hosting or any other static site hosting service. You're all set\!

-----

## 🆚 版本对比 (Version Comparison)

| 功能 (Feature) | `index.html` (本地版 / Local) | Firebase (云端版 / Cloud) |
| :--- | :---: | :---: |
| 数据存储 (Data Storage) | 浏览器本地 (Browser LocalStorage) | 云端数据库 (Cloud Firestore) |
| 联网要求 (Internet Requirement) | 离线可用 (Offline Capable) | 需要在线 (Online Required) |
| 多设备同步 (Multi-device Sync) | ❌ | ✅ |
| 用户认证 (User Authentication) | ❌ | ✅ (Google Login) |
| 共享与权限 (Sharing & Permissions) | ❌ | ✅ (管理员/只读) |
| 部署 (Deployment) | 打开文件即可 (Just open the file) | 需要配置和托管 (Needs configuration & hosting) |

-----

## 📥 关于数据导入与Steam API (About Data Import & Steam API)

### CSV 导入要求 (CSV Import Requirements)

CSV导入是快速填充数据的强大功能！为确保顺利导入，请务- 必保证你的CSV文件满足以下格式：
CSV import is a powerful feature for quickly populating your data\! To ensure a successful import, please make sure your CSV file meets the following format requirements:

  * **必须包含表头 (header row)**。
    **Must include a header row**.
  * 表头中**必须包含** `id`, `name`, 和 `type` 这三列。
    The header **must contain** the columns: `id`, `name`, and `type`.
  * 每一行的 `id` **必须是独一无二的**，不能重复。
    The `id` for each row **must be unique** and cannot be duplicated.

一个标准的表头行看起来像这样：
A standard header row looks like this:
`id,name,short,type,sort,purchaseDate,purchasePrice,from,playTime,pass,passDate,sellDate,sellPrice`

**小贴士 (Tip):** 你可以先手动添加一条数据，然后**导出CSV**，以此作为你创建批量导入文件的完美模板！
You can first add one record manually and then **export it as a CSV** to use as a perfect template for creating your bulk import file\!

### Steam API 高手提示 (Steam API Pro-Tip)

懒得手动输入成百上千个Steam游戏数据？我们给你个高手提示！
Too lazy to manually enter hundreds of Steam games? Here's a pro-tip for you\!

你可以使用 **Steam Web API** 来程序化地获取你的个人游戏库列表和每个游戏的游玩时长。
You can use the **Steam Web API** to programmatically get your list of games and the playtime for each one.

虽然本项目没有直接集成该功能，但你可以通过API获取数据后，整理成符合上述要求的CSV文件，然后一键导入。这样可以大大减少手动输入的工作量，让数据更精准！
Although this project does not directly integrate this feature, you can fetch the data via the API, format it into a CSV file that meets the requirements above, and then import it with one click. This can significantly reduce manual data entry and make your data more accurate\!

-----

## ❗ 免责声明 (Disclaimer)

**郑重声明：代码不是我写的！**
**A Solemn Declaration: I didn't write the code\!**

本项目所有代码，包括HTML, CSS, 和 JavaScript，完全由 **Google 的 Gemini 2.5 Pro** 模型生成。包括这份 README 文档本身，也是AI的杰作！
All code in this project, including HTML, CSS, and JavaScript, was entirely generated by **Google's Gemini 2.5 Pro** model. And this README document itself is also a masterpiece from the AI\!

我本人对编程一窍不通，纯粹是出于兴趣，提供了一个想法和不断调试的耐心。
I, myself, am a complete novice in programming. This project was born purely out of interest, my contribution being the idea and the patience for continuous debugging.

因此，如果代码有任何bug、安全漏洞或改进建议，请不要问我...**去问AI吧！**
Therefore, if there are any bugs, security vulnerabilities, or suggestions for improvement in the code, please don't ask me... **go ask an AI\!**
