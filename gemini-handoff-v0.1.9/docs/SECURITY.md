# 安全与隐私要求

## 凭据存储

- Windows 上通过 Electron `safeStorage`（DPAPI）加密整个会话 JSON。
- 文件名为 `kapibala-credentials.json`，位于 Electron `app.getPath('userData')`。
- 文件中只能有加密后的 access token、Cookie、用户标识和过期时间；不能出现明文密码。
- `logout()` 删除本地加密凭据。
- 若 `safeStorage.isEncryptionAvailable()` 为 false，拒绝写入并提示用户重启/检查系统。

## 网络

- 仅访问配置的 HTTPS `baseUrl`（默认 `https://kapibala.asia`）。
- 请求超时 20 秒；对 401/403 执行一次会话续期，避免无限重试。
- renderer 不应直接访问 API，也不应启用 Node integration。
- `openExternal()` 只接受 `http://` 或 `https://` URL。

## 交付与测试

- 禁止把真实账号、密码、Cookie、token、userData 目录、截图中的敏感数据提交到 Git、ZIP 或安装器。
- `tests/verify-history-fetch.cjs` 使用本地 mock 数据，不能改成真实登录测试。
- 生产构建前执行 `node --check`，并在 Windows 10/11 做安装、刷新和卸载验证。
