# Kapibala API 合约

## 基础信息

- 默认服务地址：`https://kapibala.asia`
- 所有请求使用 HTTPS、`Accept: application/json` 和 `User-Agent: ApiUsageBar/0.1 (Windows)`。
- 当前只实现 Kapibala；OpenAI、Anthropic、Google Gemini、Azure OpenAI、DeepSeek、智谱等仅保留 provider/model 映射扩展位。

## 登录与会话

### 登录

`POST /api/user/login?turnstile=`

请求体：

```json
{ "username": "邮箱或用户名", "password": "用户密码" }
```

成功响应通常为 `{ success: true, data: {...} }`，`data` 中可能包含 `access_token`、`token_type`、`access_expires_at`、`session` 和用户标识。客户端保存的是会话信息，不保存明文密码。

### 会话续期

`POST /api/user/auth/refresh`

请求头可能包含：

- `X-Auth-Session: <session.sid>`
- `Cookie: <cookie header>`

返回新的 `access_token`、`token_type`、`access_expires_at`、`session`。access token 接近过期（60 秒内）时，主进程客户端会先续期。

### 业务请求认证头

```http
Authorization: Bearer <access_token>
Cookie: <cookie header>
New-Api-User: <user id>
```

实际使用哪一项由登录响应决定；不能在 renderer 中拼接或持久化这些凭据。

## 仪表盘接口

以下请求均使用业务认证头。

| 用途 | 方法与路径 | 主要字段 |
|---|---|---|
| 公共配置/计价 | `GET /api/status` | `quota_per_unit`、`quota_display_type`、`usd_exchange_rate`、`custom_currency_exchange_rate` |
| 账户余额 | `GET /api/user/self` | `quota`、`used_quota`、`request_count`、`status`、`id`、`username` |
| 订阅明细 | `GET /api/subscription/self` | 订阅对象数组；兼容 `amount_total`/`total_amount`/`quota`、`amount_used`/`used_quota`、`end_time`/`expires_at` |
| 订阅名称字典 | `GET /api/subscription/plans` | `id`/`plan_id`、`title`/`name` |
| 今日统计 | `GET /api/log/self/stat?start_timestamp=<unix>&end_timestamp=<unix>&type=2` | `quota`、`rpm`、`tpm` |
| 本周统计 | 同上，起点为本周一 00:00 | `quota`、`rpm`、`tpm` |
| 明细日志 | `GET /api/log/self?...&p=<page>&page_size=100&type=2` | `items`、`total`；日志含 `created_at`、`model_name`、`quota`、`prompt_tokens`、`completion_tokens` |

`type=2` 对应消费日志（`LogTypeConsume`）。Unix 时间戳使用秒。

## 历史日志策略

服务端 New API 实现对单个时间范围有约 10,000 条日志上限。`KapibalaClient.fetchLogs()` 的策略如下：

1. 起点优先使用用户创建日期；若接口未返回该字段，则省略 `start_timestamp`，让服务端使用无下限查询。
2. 首页读取 `total` 并分页，每页 100 条；兼容没有 `total` 的部署，遇到短页/空页才停止。
3. 若某时间范围达到 10,000 条，按秒二分为左右两个不重叠时间段递归查询，直到每段低于上限。
4. 合并前按日志 ID/请求 ID 去重，再转换为内部日志对象。
5. 如果极端情况下同一秒仍超过上限，返回 `historyComplete:false`、`historyTruncated:true`，不能伪装成完整历史。

前端热力图应使用返回的 `daily`、`historyStart`、`historyEnd`；不要自行截取最近 7 天或 90 天。

## 错误语义

`kapibala-client.cjs` 将网络和 HTTP 错误转换为 `ClientError`：

- `HTTP_401`/`HTTP_403` 或 `AUTH_EXPIRED`：会话失效，尝试一次续期，失败后要求重新登录。
- `NETWORK_ERROR`：无法连接服务。
- `TIMEOUT`：20 秒请求超时。
- `LOGIN_FAILED`：登录响应无有效会话或账号密码错误。
- `STORAGE_UNAVAILABLE`：Windows 安全存储不可用。

renderer 只需显示错误消息和提供重新连接入口，不应读取错误中的 token/cookie。
