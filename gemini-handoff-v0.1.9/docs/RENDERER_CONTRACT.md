# Renderer 交互边界（不规定 UI）

Gemini 可以完全重做 HTML/CSS/视觉设计，但应保持以下桥接方法和数据语义。

## `window.kapibala` 白名单

```js
await window.kapibala.getStoredStatus()
await window.kapibala.login(username, password)
await window.kapibala.refresh()
await window.kapibala.logout()
await window.kapibala.openExternal(url)
await window.kapibala.minimizeWindow()
await window.kapibala.toggleMaximizeWindow()
await window.kapibala.closeWindow()
await window.kapibala.setMinimumSizeForMode('widget' | 'full')
await window.kapibala.setModeBounds({ mode, width, height })
```

方法返回 Promise。登录密码只在调用时传入，不要写入 localStorage、文件或日志。

## 状态接口

### `getStoredStatus()`

```js
{ authenticated: boolean, username: string, provider: 'kapibala.asia' }
```

### `refresh()` / `login()` 成功返回

完整结构见 `DATA_SCHEMA.json`。关键字段：

- `authenticated`、`provider`、`username`、`fetchedAt`
- `currency`、`currencySymbol`
- `account.balance`、`account.used`、`account.total`、`account.requests`
- `today`、`week`：`spent`、`tokens`、`inputTokens`、`outputTokens`、`requests`、`averageRPM`、`averageTPM`
- `daily[]`：`date`（`YYYY-MM-DD`）、`spent`、`tokens`、`requests`
- `historyStart`、`historyEnd`、`historyComplete`、`historyTruncated`
- `models.week[]`、`models.today[]`：模型名、logo provider、请求、Token、费用、占比
- `subscriptions[]` 和 `subscriptionSummary`

## 前端必须保留的行为

- 任何数据缺失都显示占位/空态，不要把 `0` 和“未连接”混淆。
- 热力图日期范围直接使用 `historyStart` 至 `historyEnd`，不能固定切片。
- `historyComplete:false` 时应提供非阻塞提示（例如“历史记录可能受服务端限制”）。
- 订阅可能同时存在多个有效计划，逐条展示到期日。
- 主题切换、窗口模式和动画属于 Gemini 的 UI 决策，但不得影响上述数据调用。
