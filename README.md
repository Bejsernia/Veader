# Veader

Veader 是一个面向 Android / iOS 的本地优先漫画阅读器，目前处于开发分支阶段（`develop`）。项目使用 Expo、React Native、TypeScript 和 SQLite。

## 当前状态

当前版本已经可以在 Android 模拟器或真机上验证以下真实流程：

- 通过 Android 系统目录授权添加漫画源；一级子文件夹作为漫画系列，系列内的 EPUB / PDF / MOBI 文件作为章节。
- 使用持久化 SQLite 保存漫画源、系列、章节、阅读位置和封面设置。
- 以源文件 URI 作为权威数据；EPUB 只在打开时解压到缓存目录，不复制整套漫画到应用私有库。
- 书架、最近阅读、系列目录、开始阅读 / 继续阅读和真实阅读进度。
- EPUB 漫画分页阅读、点击区域翻页、左右/从上到下阅读方向、单页/双页/拆分双页、奇偶页顺序、阅读背景切换、自动白边裁切、进度拖动、音量键翻页和章节目录入口。
- Android 使用 `PdfRenderer` 在应用内逐页渲染 PDF；MOBI 使用本地 PalmDOC 解析器生成可分页阅读内容，不把原文件整体复制到应用库。
- Android 的 FTP / SMB2/3 漫画源可以真实扫描和按需下载；账号密码由 Android Keystore 加密保存，不写入 SQLite。
- Android 原生 SAF 扫描器，用于处理 Android 14 下的嵌套目录。

以下部分仍属于开发中：

- iOS 已加入系统文件夹选择桥接，仍需在 macOS / Xcode 上做安全作用域书签和 PDF 原生渲染的端到端验证；当前 iOS PDF 会回退到 WebView。
- 自动白边裁切和 PDF 原生渲染目前是 Android 原生实现，iOS 会保留原图或使用系统回退路径。
- SMB / FTP 远程源的 Android 刷新会把远程文件按需下载到受上限管理的远程缓存；原始文件不会被移动或重命名。

## 开发环境

- Node.js 18 或更高版本
- Android Studio、Android SDK、Android Emulator（Android 14 x86_64 推荐）
- iOS 开发需要 macOS 和 Xcode

Windows 开发时，项目可以使用仓库内的 `.tools` 目录提供的便携 JDK / Android SDK；该目录不会提交到 Git。

## 安装与运行

```bash
npm install
npm run typecheck
npm run start
```

Android：

```bash
npm run android
```

也可以在 Android Studio 中启动已创建的模拟器，再安装构建出的 APK。

## 构建 APK

```bash
npm run build:apk
```

生成文件为项目根目录下的 `Veader-0.1.0.apk`。APK、构建目录、模拟器截图和本地图书资源均被 Git 忽略，不应提交到仓库。

云端备用构建：

```bash
npm run build:apk:cloud
npm run build:aab
```

## 目录结构

```text
App.tsx                         主导航、书架、漫画源、目录和阅读器界面
src/library.ts                  SQLite 数据库、漫画源扫描和进度持久化
src/content.ts                  EPUB / PDF / MOBI 内容解析入口
src/epub-native.ts              EPUB 临时缓存与解压
src/protocols.ts                SMB / FTP 原生适配器接口
modules/veader-folder-picker/   iOS 系统文件夹选择桥接
android/app/src/main/java/...   SAF、PDF/裁切、FTP/SMB 和音量键原生模块
scripts/                        启动与 Android 构建脚本
```

## 漫画目录约定

选择一个总目录后，目录结构应类似：

```text
漫画总目录/
├─ 死亡笔记/
│  ├─ 卷01.epub
│  ├─ 卷02.epub
│  └─ 卷03.epub
└─ 鱼/
   ├─ 卷01.epub
   └─ 卷02.epub
```

应用不会自动移动或重命名源文件。删除漫画源会删除该源在应用数据库中的索引和阅读记录，但不会删除原始文件。

## Git 工作流

当前仓库使用开发分支 `develop`。功能完成并经过 Android 验证前，不将其视为正式发布版本；本地提交不会自动推送到远程仓库。
