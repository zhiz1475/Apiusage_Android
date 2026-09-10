# ApiUsageBar · Kapibala Windows 客户端

这是一个面向 Windows 10/11 的 Kapibala（`https://kapibala.asia`）账户用量桌面小组件。包含小组件/完整版、白天/夜晚主题、平面信息面板、Coding Plan 环形进度、消耗柱状图/调用热力图、模型 Logo 和本周/今天切换。

## 构建安装器

需要 Node.js 18 或更高版本（当前使用 Node 22）。在项目目录运行：

```powershell
npm install
npm run dist
```

安装器会生成在 `dist\ApiUsageBar-Setup-0.1.9-x64.exe`。安装器为 NSIS 格式，支持选择安装目录、创建桌面快捷方式和开始菜单快捷方式。

无边框窗口支持拖动标题栏移动；小组件模式固定为约 360×360 DIP 的紧凑尺寸（在高 DPI 显示器的可用工作区不足时安全缩小并保留内容滚动），并提供“置顶”按钮覆盖其他窗口。完整版最小尺寸为 720×580，仍可由 Windows 原生 `WS_THICKFRAME` 从四边和四角调整大小，模式切换会进行平滑自适应。窗口使用不透明渲染表面配合卡片级 CSS 平面材质（Windows 10/11 一致），避免透明窗口无法获得原生缩放命中区域的问题。

### 缩放问题的根因与修复

Electron/Windows 会在 `frame:false + transparent:true` 组合下强制移除 `WS_THICKFRAME`。旧版只能依赖网页边缘热区和 `setBounds()`，向内缩小时窗口边缘会先离开网页指针区域，因此 `pointermove` 中断，表现为“只能放大”。0.1.8 保持 `frame:false + transparent:false + thickFrame:true`，由 Windows 直接处理 `WM_NCHITTEST` 和四边/四角缩放；网页层只负责标题栏拖动和信息面板渲染，不再参与缩放事件。小组件的渲染请求和原生窗口统一固定为 360×360 DIP，避免刷新或切换模式后被内容测量拉回旧尺寸，并把卡片下方空白压缩到安全底边。

开发预览：

```powershell
npm start
```

## 实时数据接口

当前已接入 Kapibala 账户接口：

- `POST /api/user/login`
- `GET /api/status`
- `GET /api/user/self`
- `GET /api/subscription/plans`
- `GET /api/subscription/self`
- `GET /api/log/self/stat`
- `GET /api/log/self`（分页聚合）

完整版热力图会从接口返回的最早日志日期开始生成（按周列展示，历史较长时在图表内部横向滚动），而不是固定截取最近 90 天。

登录后每 60 秒自动刷新，也可以点击界面右上角的刷新按钮手动刷新。OpenAI、Anthropic、Gemini、Azure OpenAI、DeepSeek、智谱等官方接口已预留模型识别和 Logo 映射，后续可以在客户端层继续加入对应连接器。

## 凭据安全

应用不会把密码写入文件。登录得到的 access token、会话 Cookie 和账号标识使用 Electron `safeStorage`（Windows DPAPI）加密后保存于当前用户的应用数据目录；退出登录会删除本地加密凭据。网络请求使用 HTTPS。

首次安装时 Windows SmartScreen 可能显示“未知发布者”，这是因为当前安装包未使用商业代码签名证书。可以在确认文件来源后选择运行；如需企业分发，后续可为安装器配置代码签名证书。

## 直接打开原型

也可以双击 `index.html` 查看离线 UI 原型，但浏览器预览模式不会读取真实账户。实时登录和安全存储需要运行 Electron 应用。

## Android 移动版

手机入口位于 `mobile/`，采用 Capacitor 8，并保留桌面端文件与窗口逻辑不变。移动版针对 360–412dp 屏幕重做了首屏 KPI、历史热力图、模型卡片、底部导航和登录抽屉。先运行 `npm run mobile:preview` 查看预览，确认 UI 后再执行 `npm run cap:sync` 和 Android 构建；完整说明见 [MOBILE-APP.md](MOBILE-APP.md)。
