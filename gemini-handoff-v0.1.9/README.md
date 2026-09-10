# ApiUsageBar / Kapibala 数据层交接包

这是交给 Gemini 继续完成前端 UI 与 Windows 安装封装的交接包。

本包刻意不包含当前版本的 HTML、CSS、前端视觉资源和预览图。Gemini 可以依据接口、数据模型和 Electron 边界重新设计界面；主进程、数据层、安全存储和窗口行为已经整理在 `source/` 中。

## 包含内容

- `source/main.cjs`：Electron 主进程、窗口/托盘、原生缩放、IPC 注册。
- `source/preload.cjs`：安全的 `contextBridge` API。
- `source/kapibala-client.cjs`：Kapibala 登录、会话续期、余额/订阅/日志读取、聚合和历史分页。
- `source/package.json`、`source/package-lock.json`：Node/Electron 依赖与 Windows NSIS 配置参考。
- `tests/verify-history-fetch.cjs`：离线模拟 12,050 条日志，验证 10,000 条服务端上限下的时间分段和无 `total` 分页兜底。
- `docs/API_CONTRACT.md`：接口、请求头和字段映射。
- `docs/DATA_SCHEMA.json`：`loadDashboard()` 返回对象的机器可读结构。
- `docs/ARCHITECTURE.md`：进程边界、刷新、认证、安全与窗口实现方式。
- `docs/RENDERER_CONTRACT.md`：Gemini 需要实现的前端调用边界，不规定任何视觉方案。
- `docs/SECURITY.md`：凭据与隐私约束。

## 快速开始

```powershell
cd source
npm install
```

当前包没有 renderer 入口。Gemini 完成自己的 `index.html`/renderer 后，再把入口文件和资源加入 `package.json > build.files`，然后运行：

```powershell
npm run dist
```

目标系统：Windows 10/11，目标架构：x64，安装器：NSIS。

## 重要约束

1. 不要把账号、密码、Cookie、access token 或本机凭据文件放进项目或交付包。
2. 所有真实账号测试应由用户在本机登录完成；本包只提供离线 mock 测试。
3. renderer 只能通过 `preload.cjs` 暴露的 API 访问主进程，不要打开 Node 集成。
4. `transparent:false + thickFrame:true` 是原生四边/四角缩放正常工作的前提；不要为了视觉透明而改回 `transparent:true`。
5. 当前 `main.cjs` 默认加载项目根目录 `index.html`。Gemini 重新组织目录后需同步修改 `loadFile()` 和打包文件列表。

## 当前版本

交接基线：`0.1.9`。本包不包含 EXE；EXE 应在 Gemini 完成 UI、用户验收后再构建。
