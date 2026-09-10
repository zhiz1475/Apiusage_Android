const fs = require('node:fs/promises');
const path = require('node:path');
const { safeStorage } = require('electron');

const DEFAULT_BASE_URL = 'https://kapibala.asia';
const USER_AGENT = 'ApiUsageBar/0.1 (Windows)';
const PAGE_SIZE = 100;
const MAX_LOG_PAGES = 100;
// New-API deployments cap one time-range query at 10,000 records.  When a
// range reaches that cap we split the range and query both halves so older
// history is not silently truncated.
const MAX_LOG_RECORDS = PAGE_SIZE * MAX_LOG_PAGES;
const MAX_LOG_SPLIT_DEPTH = 20;
const MIN_SPLIT_MS = 2 * 1000;

class ClientError extends Error {
  constructor(message, code = 'CLIENT_ERROR') {
    super(message);
    this.name = 'ClientError';
    this.code = code;
  }
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function asInt(value) {
  const number = asNumber(value);
  return number === null ? null : Math.trunc(number);
}

function dictionaries(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) dictionaries(item, result);
  } else if (value && typeof value === 'object') {
    result.push(value);
    for (const child of Object.values(value)) dictionaries(child, result);
  }
  return result;
}

function firstValue(value, keys) {
  for (const object of dictionaries(value)) {
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null) return object[key];
    }
  }
  return null;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = asNumber(value);
  if (numeric !== null) {
    const millis = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function isoDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateLabel(value) {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function parseCookies(headers) {
  let setCookies = [];
  if (typeof headers.getSetCookie === 'function') setCookies = headers.getSetCookie();
  if (!setCookies.length) {
    const raw = headers.get('set-cookie');
    if (raw) setCookies = raw.split(/,(?=\s*[^;,=]+=[^;,]+)/g);
  }
  return setCookies.map(cookie => cookie.split(';', 1)[0].trim()).filter(Boolean).join('; ');
}

function mergeCookies(existing, incoming) {
  const values = new Map();
  for (const header of [existing, incoming]) {
    for (const part of String(header || '').split(';')) {
      const separator = part.indexOf('=');
      if (separator <= 0) continue;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (name && value) values.set(name, value);
    }
  }
  return [...values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function modelLogo(modelName) {
  const name = String(modelName || '').toLowerCase();
  if (name.includes('claude') || name.includes('anthropic')) return 'anthropic';
  if (name.includes('gemini') || name.includes('google')) return 'gemini';
  if (name.includes('deepseek')) return 'deepseek';
  if (name.includes('glm') || name.includes('chatglm') || name.includes('zhipu')) return 'glm';
  if (name.includes('qwen') || name.includes('通义')) return 'qwen';
  if (name.includes('mistral')) return 'mistral';
  return 'openai';
}

class KapibalaClient {
  constructor({ userDataPath, baseUrl = DEFAULT_BASE_URL }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.storePath = path.join(userDataPath, 'kapibala-credentials.json');
    this.store = null;
    this.refreshPromise = null;
    this.lastHistoryComplete = true;
  }

  async readStore() {
    if (this.store) return this.store;
    try {
      const encrypted = await fs.readFile(this.storePath, 'utf8');
      if (!safeStorage.isEncryptionAvailable()) return null;
      const decoded = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      this.store = JSON.parse(decoded);
      return this.store;
    } catch {
      return null;
    }
  }

  async writeStore(store) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new ClientError('Windows 安全存储暂不可用，请重启应用后再试', 'STORAGE_UNAVAILABLE');
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(store)).toString('base64');
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const tempPath = `${this.storePath}.tmp`;
    await fs.writeFile(tempPath, encrypted, 'utf8');
    try {
      await fs.rename(tempPath, this.storePath);
    } catch (error) {
      // Windows does not replace an existing file with rename(). The file only
      // contains the encrypted credential blob, so replacing it is safe.
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
      try { await fs.unlink(this.storePath); } catch { /* destination may be absent */ }
      await fs.rename(tempPath, this.storePath);
    }
    this.store = store;
  }

  async getStoredStatus() {
    const store = await this.readStore();
    return {
      authenticated: Boolean(store?.accessToken || store?.cookieHeader),
      username: store?.username || '',
      provider: 'kapibala.asia'
    };
  }

  async login(username, password) {
    if (!String(username || '').trim() || !String(password || '')) {
      throw new ClientError('请输入账号和密码', 'INVALID_CREDENTIALS');
    }
    const url = `${this.baseUrl}/api/user/login?turnstile=`;
    const response = await this.request(url, {
      method: 'POST',
      body: { username: String(username).trim(), password: String(password) },
      auth: false
    });
    const payload = response.body || {};
    if (payload.success === false) {
      throw new ClientError(payload.message || '账号或密码错误', 'LOGIN_FAILED');
    }
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const accessToken = data.access_token || data.accessToken || data.token || '';
    const tokenType = data.token_type || data.tokenType || 'Bearer';
    const accessExpiresAt = asNumber(data.access_expires_at ?? data.accessExpiresAt);
    const session = data.session && typeof data.session === 'object' ? data.session : null;
    let cookieHeader = parseCookies(response.headers);
    if (!cookieHeader && typeof data.session === 'string' && data.session.includes('=')) cookieHeader = data.session;
    if (!accessToken && !cookieHeader) throw new ClientError('登录响应缺少会话信息', 'LOGIN_FAILED');
    const user = data.user && typeof data.user === 'object' ? data.user : null;
    const userId = data.id ?? data.user_id ?? data.userId ?? user?.id ?? null;
    await this.writeStore({
      username: String(username).trim(),
      userId: userId === null ? null : String(userId),
      accessToken: accessToken || null,
      tokenType,
      accessExpiresAt,
      session,
      sessionSid: session?.sid || null,
      cookieHeader,
      savedAt: new Date().toISOString()
    });
    return this.refresh();
  }

  async logout() {
    this.store = null;
    try { await fs.unlink(this.storePath); } catch { /* already absent */ }
    return { authenticated: false, provider: 'kapibala.asia' };
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.loadDashboard().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async loadDashboard(authRetry = false) {
    let store = await this.readStore();
    if (!store || (!store.accessToken && !store.cookieHeader)) {
      return { authenticated: false, provider: 'kapibala.asia' };
    }

    // Kapibala access tokens are intentionally short-lived. Rotate them before
    // expiry so the one-minute renderer refresh never sends a stale token.
    if (this.shouldRotate(store)) {
      store = await this.rotateSessionOrThrow(store);
    }

    const headers = this.sessionHeaders(store);

    const publicStatus = await this.request(`${this.baseUrl}/api/status`, { headers, auth: false });
    const status = publicStatus.body?.data ?? publicStatus.body ?? {};
    const quotaPerUnit = asNumber(firstValue(status, ['quota_per_unit', 'QuotaPerUnit'])) || 500000;
    const displayType = String(firstValue(status, ['quota_display_type', 'QuotaDisplayType']) || 'USD').toUpperCase();
    const exchangeRate = asNumber(firstValue(status, ['usd_exchange_rate', 'USDExchangeRate'])) || 1;
    const customRate = asNumber(firstValue(status, ['custom_currency_exchange_rate', 'CustomCurrencyExchangeRate'])) || 1;
    const displayRate = displayType === 'CNY' ? exchangeRate : displayType === 'CUSTOM' ? customRate : 1;
    const currency = displayType === 'CNY' ? 'CNY' : displayType === 'CUSTOM' ? 'CUSTOM' : 'USD';
    const currencySymbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '¤';
    const money = raw => {
      const number = asNumber(raw);
      return number === null ? null : Number((number / quotaPerUnit * displayRate).toFixed(6));
    };

    const [userResult, subscriptionsResult, plansResult, todayStatsResult, weekStatsResult] = await Promise.allSettled([
      this.request(`${this.baseUrl}/api/user/self`, { headers }),
      this.request(`${this.baseUrl}/api/subscription/self`, { headers }),
      this.request(`${this.baseUrl}/api/subscription/plans`, { headers }),
      this.request(`${this.baseUrl}/api/log/self/stat?start_timestamp=${Math.floor(startOfDay().getTime() / 1000)}&end_timestamp=${Math.floor(Date.now() / 1000)}&type=2`, { headers }),
      this.request(`${this.baseUrl}/api/log/self/stat?start_timestamp=${Math.floor(startOfWeek().getTime() / 1000)}&end_timestamp=${Math.floor(Date.now() / 1000)}&type=2`, { headers })
    ]);
    if (userResult.status === 'rejected' && this.isAuthError(userResult.reason)) {
      if (authRetry) throw new ClientError('登录已过期，请重新连接 Kapibala 账户', 'AUTH_EXPIRED');
      await this.rotateSessionOrThrow(store);
      return this.loadDashboard(true);
    }
    const user = userResult.status === 'fulfilled' ? (userResult.value.body?.data ?? userResult.value.body ?? {}) : {};
    const rawBalance = firstValue(user, ['quota', 'balance']);
    const rawUsed = firstValue(user, ['used_quota', 'total_used_quota']);
    const account = {
      balance: money(rawBalance) ?? 0,
      used: money(rawUsed) ?? 0,
      total: (money(rawBalance) ?? 0) + (money(rawUsed) ?? 0),
      requests: asInt(firstValue(user, ['request_count', 'requests'])) || 0,
      status: String(firstValue(user, ['status']) || 'enabled')
    };

    const planTitles = new Map();
    if (plansResult.status === 'fulfilled') {
      for (const item of dictionaries(plansResult.value.body?.data ?? plansResult.value.body)) {
        const id = asInt(item.id ?? item.plan_id);
        const title = item.title || item.name;
        if (id !== null && title) planTitles.set(id, String(title));
      }
    }
    const subscriptions = parseSubscriptions(
      subscriptionsResult.status === 'fulfilled' ? (subscriptionsResult.value.body?.data ?? subscriptionsResult.value.body) : {},
      planTitles, money
    );

    let logs = [];
    let logsError = null;
    const historyEnd = new Date();
    // The previous implementation hard-coded a 90-day lower bound.  That
    // made the heatmap look as if it only knew about a recent slice of the
    // account history, even though Kapibala's log endpoint can return older
    // records.  Prefer the account creation date when the user payload
    // exposes it; otherwise pass epoch (which New API/Kapibala interprets as
    // "no lower bound").  The server still protects itself with its normal
    // log-search cap and pagination limit in fetchLogs().
    const createdAt = toDate(firstValue(user, [
      'created_at', 'createdAt', 'created_time', 'createdTime', 'created'
    ]));
    const historyQueryStart = createdAt && createdAt.getTime() < historyEnd.getTime()
      ? startOfDay(createdAt)
      : new Date(0);
    try {
      logs = await this.fetchLogs(historyQueryStart, historyEnd, headers);
    } catch (error) {
      logsError = error;
      if (this.isAuthError(error)) {
        if (authRetry) throw new ClientError('登录已过期，请重新连接 Kapibala 账户', 'AUTH_EXPIRED');
        await this.rotateSessionOrThrow(store);
        return this.loadDashboard(true);
      }
    }

    const todayStats = parseStats(todayStatsResult, money);
    const weekStats = parseStats(weekStatsResult, money);
    const now = new Date();
    const today = aggregate(logs, startOfDay(), now, money);
    const week = aggregate(logs, startOfWeek(), now, money);
    mergeStats(today, todayStats);
    mergeStats(week, weekStats);
    // Render from the oldest record we actually received.  If the endpoint
    // has no records (or is temporarily unavailable), retain a small empty
    // window so the dashboard still has a useful shape while disconnected.
    const earliestLog = logs.reduce((earliest, log) => {
      if (!log?.createdAt) return earliest;
      return !earliest || log.createdAt < earliest ? log.createdAt : earliest;
    }, null);
    const fallbackStart = new Date(now.getTime() - 90 * 86400000);
    const dailyStart = earliestLog
      ? startOfDay(earliestLog)
      : (historyQueryStart.getTime() > 0 ? historyQueryStart : fallbackStart);
    const daily = aggregateDaily(logs, dailyStart, now, money);
    const models = {
      week: aggregateModels(logs, startOfWeek(), new Date(), money),
      today: aggregateModels(logs, startOfDay(), new Date(), money)
    };
    if (!logs.length && logsError) {
      // Keep the dashboard useful when the detailed log endpoint is temporarily unavailable.
      today.models = [];
      week.models = [];
    }

    return {
      authenticated: true,
      provider: 'kapibala.asia',
      username: store.username || '',
      fetchedAt: new Date().toISOString(),
      currency,
      currencySymbol,
      account,
      today,
      week,
      daily,
      historyStart: dailyStart.toISOString(),
      historyEnd: now.toISOString(),
      historyComplete: !logsError && this.lastHistoryComplete,
      historyTruncated: Boolean(logsError || !this.lastHistoryComplete),
      models,
      subscriptions,
      subscriptionSummary: {
        count: subscriptions.length,
        total: subscriptions.reduce((sum, item) => sum + (item.total || 0), 0),
        remaining: subscriptions.reduce((sum, item) => sum + (item.remaining || 0), 0),
        nearestExpiry: subscriptions.map(item => item.endDate).filter(Boolean).sort()[0] || null
      }
    };
  }

  shouldRotate(store) {
    const expiresAt = asNumber(store?.accessExpiresAt ?? store?.access_expires_at);
    // A legacy store may not have an expiry timestamp. If it has a session
    // cookie, attempt the refresh endpoint once; it can infer the session.
    if (!expiresAt) return Boolean(store?.sessionSid || store?.session?.sid || store?.cookieHeader);
    return expiresAt <= Math.floor(Date.now() / 1000) + 60;
  }

  isAuthError(error) {
    return error?.code === 'HTTP_401' || error?.code === 'HTTP_403' || error?.code === 'AUTH_EXPIRED';
  }

  sessionHeaders(store) {
    const headers = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'Cache-Control': 'no-store'
    };
    if (store.accessToken) headers.Authorization = `${store.tokenType || 'Bearer'} ${store.accessToken}`;
    if (store.cookieHeader) headers.Cookie = store.cookieHeader;
    if (store.userId) headers['New-Api-User'] = store.userId;
    return headers;
  }

  async rotateSession(store) {
    const headers = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'Cache-Control': 'no-store'
    };
    const sessionSid = store.sessionSid || store.session?.sid;
    if (sessionSid) headers['X-Auth-Session'] = sessionSid;
    if (store.cookieHeader) headers.Cookie = store.cookieHeader;
    const response = await this.request(`${this.baseUrl}/api/user/auth/refresh`, { method: 'POST', headers });
    const payload = response.body || {};
    if (payload.success !== true || !payload.data || typeof payload.data !== 'object') {
      const code = payload.code || 'AUTH_REFRESH_FAILED';
      throw new ClientError(payload.message || 'Kapibala 会话续期失败', code);
    }
    const data = payload.data;
    const accessToken = data.access_token || data.accessToken || data.token;
    const tokenType = data.token_type || data.tokenType || store.tokenType || 'Bearer';
    const accessExpiresAt = asNumber(data.access_expires_at ?? data.accessExpiresAt);
    const session = data.session && typeof data.session === 'object' ? data.session : (store.session || null);
    if (!accessToken || !accessExpiresAt) throw new ClientError('Kapibala 续期响应缺少 Token 信息', 'AUTH_REFRESH_FAILED');
    const user = data.user && typeof data.user === 'object' ? data.user : null;
    const nextStore = {
      ...store,
      username: user?.username || store.username,
      userId: String(user?.id ?? store.userId ?? session?.user_id ?? '') || null,
      accessToken,
      tokenType,
      accessExpiresAt,
      session,
      sessionSid: session?.sid || sessionSid || null,
      cookieHeader: mergeCookies(store.cookieHeader, parseCookies(response.headers)),
      savedAt: new Date().toISOString()
    };
    await this.writeStore(nextStore);
    return nextStore;
  }

  async rotateSessionOrThrow(store) {
    try {
      return await this.rotateSession(store);
    } catch (error) {
      if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') throw error;
      if (this.isAuthError(error)) throw new ClientError('登录已过期，请重新连接 Kapibala 账户', 'AUTH_EXPIRED');
      throw new ClientError('无法续期 Kapibala 登录会话，请重新登录', 'AUTH_EXPIRED');
    }
  }

  throwIfUnauthorized(error) {
    if (error?.code === 'HTTP_401' || error?.code === 'HTTP_403') {
      throw new ClientError('登录已过期，请重新连接 Kapibala 账户', 'AUTH_EXPIRED');
    }
  }

  async fetchLogs(start, end, headers) {
    this.lastHistoryComplete = true;
    const output = await this.fetchLogsRange(start, end, headers, 0);
    // A split boundary should be disjoint, but some compatible deployments
    // treat end timestamps as inclusive after rounding to seconds.  Remove
    // duplicate raw records before normalization when a payload-level id is
    // available. Id-less records are retained because distinct requests can
    // legitimately share every visible field.
    const seen = new Set();
    const unique = output.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const explicitId = item.id ?? item.log_id ?? item.logId ?? item.request_id ?? item.requestId;
      // Do not fingerprint id-less records: two distinct requests can share
      // every normalized field, and collapsing them would under-count usage.
      if (explicitId === undefined || explicitId === null) return true;
      const key = `id:${explicitId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.map(normalizeLog).filter(Boolean);
  }

  async fetchLogsRange(start, end, headers, depth = 0) {
    const startDate = start instanceof Date && !Number.isNaN(start.getTime()) ? start : null;
    const endDate = end instanceof Date && !Number.isNaN(end.getTime()) ? end : new Date();
    // A zero/epoch start is intentionally omitted.  Kapibala follows the
    // New API convention where start_timestamp=0 means "from the earliest
    // retained log"; omitting it also keeps requests compatible with
    // deployments that validate timestamp ranges strictly.
    const queryParts = [];
    if (startDate && startDate.getTime() > 0) queryParts.push(`start_timestamp=${Math.floor(startDate.getTime() / 1000)}`);
    if (endDate.getTime() > 0) queryParts.push(`end_timestamp=${Math.floor(endDate.getTime() / 1000)}`);
    queryParts.push('type=2');
    const query = queryParts.join('&');
    const first = await this.request(`${this.baseUrl}/api/log/self?${query}&p=1&page_size=${PAGE_SIZE}`, { headers });
    const firstData = first.body?.data ?? first.body ?? {};
    const firstItems = Array.isArray(firstData.items) ? firstData.items : Array.isArray(firstData) ? firstData : [];
    // New-API responses usually include `total`; compatible deployments may
    // omit it.  Without a total, continue paging until a short/empty page.
    const parsedTotal = asInt(firstData.total);
    const hasTotal = parsedTotal !== null;
    const total = hasTotal ? parsedTotal : firstItems.length;
    const pages = hasTotal
      ? Math.min(MAX_LOG_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)))
      : Math.min(MAX_LOG_PAGES, Math.max(1, firstItems.length === PAGE_SIZE ? MAX_LOG_PAGES : 1));
    const output = [...firstItems];

    if (pages > 1) {
      const concurrency = 6;
      let reachedEnd = firstItems.length < PAGE_SIZE;
      for (let cursor = 2; cursor <= pages; cursor += concurrency) {
        if (reachedEnd) break;
        const pageNumbers = Array.from({ length: Math.min(concurrency, pages - cursor + 1) }, (_, index) => cursor + index);
        const results = await Promise.allSettled(pageNumbers.map(page => this.request(
          `${this.baseUrl}/api/log/self?${query}&p=${page}&page_size=${PAGE_SIZE}`, { headers }
        )));
        for (const result of results) {
          if (result.status === 'rejected') this.throwIfUnauthorized(result.reason);
          if (result.status !== 'fulfilled') continue;
          const data = result.value.body?.data ?? result.value.body ?? {};
          const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
          output.push(...items);
          if (!hasTotal && items.length < PAGE_SIZE) reachedEnd = true;
        }
      }
    }

    // A full 10,000-record response is ambiguous: it may be exactly 10,000,
    // or it may have been truncated by the server's hard cap.  Split the time
    // range whenever the cap is reached, then recurse until each slice is
    // below the cap (or the range cannot be split any further).
    const capReached = (hasTotal && parsedTotal >= MAX_LOG_RECORDS) || output.length >= MAX_LOG_RECORDS;
    const startMs = startDate ? startDate.getTime() : 0;
    const endMs = endDate.getTime();
    if (capReached && depth < MAX_LOG_SPLIT_DEPTH && endMs - startMs >= MIN_SPLIT_MS) {
      const midpointSec = Math.floor((startMs + endMs) / 2 / 1000);
      const midpointMs = midpointSec * 1000;
      if (midpointMs > startMs && midpointMs < endMs) {
        const leftEnd = new Date(midpointMs - 1);
        const rightStart = new Date(midpointMs);
        // Keep the split traversal bounded.  A dense account can create many
        // leaves; issuing every branch at once would trip provider rate limits
        // and make the one-minute refresh less reliable.
        const left = await this.fetchLogsRange(startDate, leftEnd, headers, depth + 1);
        const right = await this.fetchLogsRange(rightStart, endDate, headers, depth + 1);
        return [...left, ...right];
      }
    }
    if (capReached) this.lastHistoryComplete = false;
    return output;
  }

  async request(url, { headers = {}, method = 'GET', body, auth = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const requestHeaders = { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers };
      const init = { method, headers: requestHeaders, signal: controller.signal };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        requestHeaders['Content-Type'] = 'application/json';
      }
      const response = await fetch(url, init);
      const text = await response.text();
      let parsed = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { throw new ClientError('服务返回了无法解析的数据', 'INVALID_RESPONSE'); }
      if (!response.ok) {
        const error = new ClientError(`Kapibala 请求失败（${response.status}）`, `HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return { body: parsed, headers: response.headers, status: response.status };
    } catch (error) {
      if (error.name === 'AbortError') throw new ClientError('请求超时，请检查网络连接', 'TIMEOUT');
      if (error instanceof ClientError) throw error;
      throw new ClientError('无法连接 Kapibala，请检查网络连接', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeLog(item) {
  if (!item || typeof item !== 'object') return null;
  const createdAt = toDate(item.created_at ?? item.createdAt ?? item.timestamp ?? item.created_time);
  if (!createdAt) return null;
  const model = String(item.model_name ?? item.model ?? item.modelName ?? 'Unknown Model').trim() || 'Unknown Model';
  const quota = asNumber(item.quota ?? item.used_quota ?? item.amount ?? item.cost) || 0;
  const inputTokens = asInt(item.prompt_tokens ?? item.input_tokens) || 0;
  const outputTokens = asInt(item.completion_tokens ?? item.output_tokens) || 0;
  const explicitTokens = asInt(item.total_tokens ?? item.tokens);
  const tokens = explicitTokens !== null ? explicitTokens : inputTokens + outputTokens;
  return { createdAt, model, logo: modelLogo(model), quota, inputTokens, outputTokens, tokens: Math.max(0, tokens) };
}

function parseStats(result, money) {
  if (!result || result.status !== 'fulfilled') return null;
  const data = result.value.body?.data ?? result.value.body ?? {};
  const rawQuota = firstValue(data, ['quota', 'used_quota', 'total_quota', 'amount', 'usage']);
  const tokens = asInt(firstValue(data, ['total_tokens', 'tokens', 'tpm'])) || 0;
  return {
    spent: rawQuota === null ? null : money(rawQuota),
    tokens: tokens || null,
    requests: asInt(firstValue(data, ['request_count', 'requests', 'count', 'rpm'])) || null,
    averageRPM: asNumber(firstValue(data, ['rpm'])) || null,
    averageTPM: asNumber(firstValue(data, ['tpm'])) || null
  };
}

function emptyAggregate() {
  return { spent: 0, tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, averageRPM: 0, averageTPM: 0, hasLogs: false };
}

function aggregate(logs, start, end, money) {
  const result = emptyAggregate();
  const startMs = start.getTime();
  const endMs = end.getTime();
  for (const log of logs) {
    const ms = log.createdAt.getTime();
    if (ms < startMs || ms > endMs) continue;
    result.hasLogs = true;
    result.spent += money(log.quota) || 0;
    result.tokens += log.tokens;
    result.inputTokens += log.inputTokens;
    result.outputTokens += log.outputTokens;
    result.requests += 1;
  }
  const minutes = Math.max(1, (endMs - startMs) / 60000);
  result.averageRPM = result.requests / minutes;
  result.averageTPM = result.tokens / minutes;
  return result;
}

function mergeStats(target, fallback) {
  if (!fallback) return;
  if (!target.hasLogs) {
    if (fallback.spent !== null) target.spent = fallback.spent;
    if (fallback.tokens !== null) target.tokens = fallback.tokens;
    if (fallback.requests !== null) target.requests = fallback.requests;
    if (fallback.averageRPM !== null) target.averageRPM = fallback.averageRPM;
    if (fallback.averageTPM !== null) target.averageTPM = fallback.averageTPM;
  }
}

function aggregateDaily(logs, start, end, money) {
  const map = new Map();
  for (const log of logs) {
    if (log.createdAt < start || log.createdAt > end) continue;
    const key = isoDay(log.createdAt);
    const item = map.get(key) || { date: key, spent: 0, tokens: 0, requests: 0 };
    item.spent += money(log.quota) || 0;
    item.tokens += log.tokens;
    item.requests += 1;
    map.set(key, item);
  }
  const result = [];
  const cursor = startOfDay(start);
  const finish = startOfDay(end);
  while (cursor <= finish) {
    const key = isoDay(cursor);
    result.push(map.get(key) || { date: key, spent: 0, tokens: 0, requests: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function aggregateModels(logs, start, end, money) {
  const map = new Map();
  for (const log of logs) {
    if (log.createdAt < start || log.createdAt > end) continue;
    const item = map.get(log.model) || { model: log.model, logo: log.logo, spent: 0, tokens: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
    item.spent += money(log.quota) || 0;
    item.tokens += log.tokens;
    item.requests += 1;
    item.inputTokens += log.inputTokens;
    item.outputTokens += log.outputTokens;
    map.set(log.model, item);
  }
  const result = [...map.values()].sort((a, b) => b.tokens - a.tokens || b.spent - a.spent);
  const total = result.reduce((sum, item) => sum + item.spent, 0) || 1;
  return result.map(item => ({ ...item, share: item.spent / total }));
}

function parseSubscriptions(value, planTitles, money) {
  const now = Date.now();
  const candidates = [];
  const seen = new Set();
  for (const item of dictionaries(value)) {
    const nested = item.subscription && typeof item.subscription === 'object' ? item.subscription : item;
    if (nested === item && !('amount_total' in item) && !('amount_used' in item) && !('total_amount' in item)) continue;
    const identity = String(nested.id ?? `${nested.plan_id ?? nested.plan ?? ''}:${nested.start_time ?? nested.startTime ?? ''}:${nested.end_time ?? nested.endTime ?? ''}`);
    if (!seen.has(identity)) { seen.add(identity); candidates.push(nested); }
  }
  return candidates.filter(item => {
    const status = String(item.status ?? '').toLowerCase();
    const end = toDate(item.end_time ?? item.endTime ?? item.expires_at ?? item.end_date);
    return status === 'active' && (!end || end.getTime() >= now);
  }).map((item, index) => {
    const total = money(item.amount_total ?? item.total_amount ?? item.quota) || 0;
    const used = money(item.amount_used ?? item.used_amount ?? item.used_quota) || 0;
    const remaining = Math.max(0, total - used);
    const end = toDate(item.end_time ?? item.endTime ?? item.expires_at ?? item.end_date);
    const planId = asInt(item.plan_id ?? item.plan);
    const title = (planId !== null && planTitles.get(planId)) || item.title || item.name || `Coding Plan ${index + 1}`;
    return {
      id: String(item.id ?? `${planId ?? 'plan'}-${index}`),
      title: String(title),
      status: String(item.status || 'active'),
      total,
      used,
      remaining,
      remainingPercent: total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0,
      endDate: end ? end.toISOString() : null,
      endLabel: end ? dateLabel(end) : '未设置到期日'
    };
  });
}

module.exports = { KapibalaClient, ClientError };
