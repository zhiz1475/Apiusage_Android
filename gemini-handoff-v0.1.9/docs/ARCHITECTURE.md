# 实现架构与行为约束

## 进程边界

```text
renderer (Gemini 重新设计)
        │ contextBridge / ipcRenderer.invoke
preload.cjs（白名单 API）
        │ IPC
main.cjs（窗口、托盘、屏幕与生命周期）
        │
kapibala-client.cjs（HTTPS、认证、聚合、安全存储）
```

- renderer：只负责 UI、动画、交互和数据展示。
- preload：只暴露 `RENDERER_CONTRACT.md` 中的白名单方法。
- main：持有 `KapibalaClient` 实例，处理窗口控制和 IPC；不要把 token 传到 DOM。
- client：访问 Kapibala、处理会话续期、字段兼容、金额换算、日志分页和聚合。

## Electron 窗口

`main.cjs` 当前配置：

- `frame:false`、`transparent:false`、`thickFrame:true`、`resizable:true`。
- `roundedCorners:true`、`hasShadow:true`。
- widget 最小尺寸：`400×600`；full 最小尺寸：`720×580`。
- 初始窗口在主屏幕工作区居中；窗口移动/缩放不操作第二块屏幕。
- renderer 可通过 `setMinimumSizeForMode()` 和 `setModeBounds()` 请求模式切换后的尺寸调整。
- 托盘图标由 `assets/kapibala-logo.ico` 提供；如 Gemini 更换资源，需同步 `main.cjs` 与 `package.json`。

不要将窗口改成 `transparent:true` 来实现玻璃效果。此前该组合会移除 Windows `WS_THICKFRAME`，导致窗口只能放大不能缩小。视觉透明/液态玻璃应完全在 renderer 的卡片层实现。

## 刷新生命周期

建议 renderer 在启动后：

1. 调用 `getStoredStatus()`。
2. 若已认证，立即调用 `refresh()`。
3. 每 60 秒调用一次 `refresh()`；同时保留手动刷新按钮。
4. `refresh()` 期间禁用重复请求，完成后更新时间戳。
5. 收到未认证或 `AUTH_EXPIRED` 时显示登录入口，不清空用户输入以外的 UI 状态。

客户端内部用 `refreshPromise` 合并并发刷新，避免一分钟定时器与手动按钮同时发起两次完整请求。

## 数据计算

- 金额原始值通过 `/api/status` 的 `quota_per_unit` 和汇率转换为显示货币。
- `account.total = account.balance + account.used`。
- `today` 和 `week` 优先使用明细日志聚合；日志暂不可用时使用 `/stat` 结果作为回退。
- `daily` 是从最早日志日到今天的逐日数组，空白日期也保留。
- `models.week` 与 `models.today` 按模型聚合请求数、输入/输出 Token、费用和占比。
- Coding Plan 只返回当前有效订阅；每个订阅保留总额度、已用、剩余比例和到期时间。

## 构建与交付

1. Gemini 添加自己的 renderer 入口和资源。
2. 修改 `main.cjs` 的 `loadFile()`（如目录变化）。
3. 将 renderer 文件加入 `package.json > build.files`。
4. `npm install` 后运行 `npm run dist`。
5. 在 Windows 10/11 验证登录、刷新、模式切换、四边/四角缩放、托盘退出和安装卸载。

当前安装器为 NSIS、x64、可选安装目录，并创建桌面/开始菜单快捷方式。未配置代码签名证书时，SmartScreen 可能显示未知发布者。
