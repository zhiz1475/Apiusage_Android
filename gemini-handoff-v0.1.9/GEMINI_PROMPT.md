# 可直接交给 Gemini 的任务说明

你接手的是一个 Windows 10/11 Electron 用量监控项目。请先阅读：

1. `README.md`
2. `docs/API_CONTRACT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/RENDERER_CONTRACT.md`
5. `docs/DATA_SCHEMA.json`
6. `docs/SECURITY.md`

你的工作范围是重新设计 renderer 前端界面并完成 Windows 安装器封装。视觉方案完全自行设计；不要恢复或依赖原项目中未提供的 HTML/CSS。

必须保留：

- `main.cjs`、`preload.cjs`、`kapibala-client.cjs` 的安全边界。
- `window.kapibala` 的方法签名和返回数据语义。
- Windows 原生可缩小/放大的 `transparent:false + thickFrame:true` 配置。
- Kapibala 全历史日志、分页、10,000 条上限分段策略和会话续期。
- 明文密码不落盘、不写日志、不打包进资源。

完成后请交付：

- renderer 入口和全部 UI 资源；
- 登录、加载、刷新、错误、空态和会话过期状态；
- 小组件/完整版、主题和窗口控制（具体视觉由你决定）；
- Windows 10/11 x64 NSIS 安装器；
- 运行记录和构建产物路径。

先运行离线测试 `node tests/verify-history-fetch.cjs`，再运行 `npm run dist`。不要使用真实账号做自动化测试，也不要把任何账号凭据放入提交内容。
