/*
 * Platform-neutral mobile data service.
 *
 * The desktop client keeps its credentials in Electron safeStorage. Android
 * cannot use that API, so this adapter stores only the session blob through a
 * replaceable secure-storage provider. Capacitor's native HTTP bridge is used
 * when present (it avoids the Kapibala API's missing CORS headers); browser
 * preview falls back to fetch and demo data remains available in mobile.js.
 */

import {DATA_VERSION,numeric,timestamp,unwrap,aggregate,aggregateDaily,aggregateModels,parseStats,parseSubscriptions,isAuthError} from './mobile-data-core.js';
import {syncHistory,fetchLogRange} from './mobile-sync.js';

const MOBILE_API_BASE = 'https://kapibala.asia';
const SESSION_KEY = 'apiusagebar.mobile.session.v1';
const CACHE_KEY = 'apiusagebar.mobile.cache.v1';
const RETRY_LIMIT = 3;
const RETRY_BASE_MS = 320;

export class MobileClientError extends Error {
  constructor(message, code = 'CLIENT_ERROR') {
    super(message);
    this.name = 'MobileClientError';
    this.code = code;
  }
}

export function asNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function asInt(value) {
  const number = asNumber(value);
  return number === null ? null : Math.trunc(number);
}

export function asDate(value) {
  return timestamp(value);
}

function dayKey(value) {
  const date = asDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value = new Date()) {
  const date = startOfDay(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function isoSeconds(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function dictionaries(value, result = []) {
  if (Array.isArray(value)) value.forEach(item => dictionaries(item, result));
  else if (value && typeof value === 'object') {
    result.push(value);
    Object.values(value).forEach(child => dictionaries(child, result));
  }
  return result;
}

function firstValue(value, keys) {
  for (const object of dictionaries(value)) {
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
  }
  return null;
}

function directValue(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
  }
  return null;
}

function parseCookieHeader(headers) {
  if (!headers) return '';
  if (typeof headers === 'object' && !Array.isArray(headers)) {
    const value = headers['set-cookie'] || headers['Set-Cookie'] || headers.cookie || headers.Cookie;
    if (Array.isArray(value)) return value.map(item => String(item).split(';', 1)[0]).join('; ');
    if (value) return String(value).split(/,(?=\s*[^;,=]+=[^;,]+)/g).map(item => item.split(';', 1)[0].trim()).filter(Boolean).join('; ');
  }
  return '';
}

function mergeCookies(existing, incoming) {
  const values = new Map();
  for (const source of [existing, incoming]) {
    String(source || '').split(';').forEach(part => {
      const at = part.indexOf('=');
      if (at <= 0) return;
      const name = part.slice(0, at).trim();
      const value = part.slice(at + 1).trim();
      if (name && value) values.set(name, value);
    });
  }
  return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeRows(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.list)) return data.list;
  return [];
}

function validatePayload(payload, label, { rows = false } = {}) {
  if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new MobileClientError(`${label}返回格式错误`, 'SCHEMA_INVALID');
  }
  if (payload.success === false) throw new MobileClientError(payload.message || `${label}返回失败`, 'API_ERROR');
  if (rows) {
    const data = payload.data ?? payload;
    const valid = Array.isArray(data) || (data && typeof data === 'object' && (Array.isArray(data.items) || Array.isArray(data.rows) || Array.isArray(data.list)));
    if (!valid) throw new MobileClientError(`${label}返回格式错误`, 'SCHEMA_INVALID');
  }
  return payload;
}

function resolveQuota(user) {
  const remaining = asNumber(directValue(user, ['quota', 'balance', 'remain_quota', 'remaining_quota', 'available_quota']));
  const used = asNumber(directValue(user, ['used_quota', 'usedQuota', 'total_used_quota', 'used', 'consumed_quota']));
  const explicitTotal = asNumber(directValue(user, ['total_quota', 'totalQuota', 'quota_total', 'credit_limit', 'limit_quota', 'total', 'total_balance']));
  return { balance: remaining, used, total: explicitTotal ?? (remaining !== null && used !== null ? remaining + used : null) };
}

export class MobileKapibalaClient {
  constructor({ baseUrl = MOBILE_API_BASE, storage = globalThis.localStorage } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.storage = storage;
    this.session = null;
    this.refreshPromise = null;
    this.renewPromise = null;
    this.authState = 'signed_out';
    this.nativeMode = Boolean(globalThis.Capacitor?.isNativePlatform?.() || globalThis.Capacitor?.getPlatform?.() === 'android');
    this.nativeStorage = globalThis.Capacitor?.Plugins?.SecureStorage || null;
    this.nativeCache = null;
    this.storageReady = false;
    this.storageWrites = Promise.resolve();
  }

  readJson(key) {
    if (this.nativeMode && !this.nativeStorage) return null;
    if (key === CACHE_KEY && this.nativeCache) return this.nativeCache;
    try { return JSON.parse(this.storage?.getItem(key) || 'null'); } catch { return null; }
  }

  writeJson(key, value) {
    const serialized = JSON.stringify(value);
    if (this.nativeStorage?.setItem) {
      this.storageWrites = this.storageWrites.catch(() => {}).then(() => this.nativeStorage.setItem(key, serialized));
      this.storageWrites.catch(() => {});
      if (key === CACHE_KEY) this.nativeCache = value;
      return this.storageWrites;
    }
    if (this.nativeMode) return;
    try { this.storage?.setItem(key, serialized); } catch { /* quota/private mode */ }
  }

  async hydrate() {
    if (this.storageReady) return;
    if (this.nativeStorage?.getItem) {
      try {
        const session = await this.nativeStorage.getItem(SESSION_KEY);
        const cache = await this.nativeStorage.getItem(CACHE_KEY);
        const sessionText = typeof session === 'string' ? session : session?.value;
        const cacheText = typeof cache === 'string' ? cache : cache?.value;
        this.session = sessionText ? JSON.parse(sessionText) : null;
        this.nativeCache = cacheText ? JSON.parse(cacheText) : null;
      } catch (error) {
        throw new MobileClientError('设备安全存储不可用，无法读取登录状态', 'STORAGE_UNAVAILABLE');
      }
    }
    this.storageReady = true;
  }

  cacheOwner() { const session=this.getSession();return session?this.baseUrl+'|'+String(session.userId||session.username):''; }
  getValidCache() { const cached=this.readJson(CACHE_KEY);return cached?.version===DATA_VERSION&&cached.owner===this.cacheOwner()?cached:null; }
  getCachedData() { return this.getValidCache()?.data || null; }

  getSession() {
    if (!this.session) this.session = this.readJson(SESSION_KEY);
    return this.session;
  }

  getStoredStatus() {
    const session = this.getSession();
    const authenticated = Boolean(session?.accessToken || session?.cookieHeader);
    this.authState = authenticated ? 'authenticated' : 'signed_out';
    return { authenticated, username: session?.username || '', authState: this.authState, needsRefresh: authenticated && this.shouldRenew(session), provider: 'kapibala.asia' };
  }

  shouldRenew(session = this.getSession()) {
    const expires = timestamp(session?.accessExpiresAt);
    return expires !== null && +expires <= Date.now() + 90000;
  }

  async request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const url = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    let lastError;
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
      try {
        const session = auth ? this.getSession() : null;
        const requestHeaders = { Accept: 'application/json', ...headers };
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
        if (auth && session?.accessToken) requestHeaders.Authorization = `${session.tokenType || 'Bearer'} ${session.accessToken}`;
        if (auth && session?.cookieHeader) requestHeaders.Cookie = session.cookieHeader;
        if (auth && session?.userId) requestHeaders['New-Api-User'] = String(session.userId);
        if (auth && session?.sessionSid) requestHeaders['X-Auth-Session'] = session.sessionSid;
        let result;
        const nativeHttp = globalThis.Capacitor?.Plugins?.CapacitorHttp || globalThis.Capacitor?.CapacitorHttp;
        if (nativeHttp?.request) {
          result = await nativeHttp.request({ url, method, headers: requestHeaders, data: body, responseType: 'json', connectTimeout:10000, readTimeout:20000 });
          const responseHeaders = result.headers || {};
          const status = Number(result.status || 200);
          const payload = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          if (status >= 400) throw new MobileClientError(payload?.message || `请求失败（${status}）`, `HTTP_${status}`);
          return { body: payload || {}, headers: responseHeaders, status };
        }
        const response = await fetch(url, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include' });
        const text = await response.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { throw new MobileClientError('接口返回不是有效 JSON', 'SCHEMA_INVALID'); }
        if (!response.ok) throw new MobileClientError(payload?.message || `请求失败（${response.status}）`, `HTTP_${response.status}`);
        return { body: payload, headers: response.headers, status: response.status };
      } catch (error) {
        lastError = error instanceof MobileClientError ? error : new MobileClientError('无法连接 Kapibala，请检查网络', 'NETWORK_ERROR');
        const retryable = ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_408', 'HTTP_429'].includes(lastError.code) || /^HTTP_5/.test(lastError.code || '');
        if (!retryable || attempt >= RETRY_LIMIT) break;
        await sleep(RETRY_BASE_MS * (2 ** attempt) + Math.floor(Math.random() * 80));
      }
    }
    throw lastError || new MobileClientError('请求失败', 'NETWORK_ERROR');
  }

  async login(username, password) {
    if (this.nativeMode && !this.nativeStorage) throw new MobileClientError('设备安全存储未安装，无法安全保存登录状态', 'STORAGE_UNAVAILABLE');
    if (!String(username || '').trim() || !String(password || '')) throw new MobileClientError('请输入账号和密码', 'INVALID_CREDENTIALS');
    this.authState = 'authenticating';
    const response = await this.request('/api/user/login?turnstile=', { method: 'POST', body: { username: String(username).trim(), password: String(password) }, auth: false });
    const payload = validatePayload(response.body || {}, '登录接口');
    if (payload.success === false) throw new MobileClientError(payload.message || '账号或密码错误', 'LOGIN_FAILED');
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const token = data.access_token || data.accessToken || data.token || '';
    const tokenType = data.token_type || data.tokenType || 'Bearer';
    const session = data.session && typeof data.session === 'object' ? data.session : null;
    const cookieHeader = mergeCookies(parseCookieHeader(response.headers), data.cookie || data.cookies || '');
    if (!token && !cookieHeader) throw new MobileClientError('登录响应缺少会话信息', 'LOGIN_FAILED');
    this.session = {
      username: String(username).trim(), userId: String(data.id ?? data.user_id ?? data.userId ?? data.user?.id ?? '') || null,
      accessToken: token || null, tokenType, accessExpiresAt: asNumber(data.access_expires_at ?? data.accessExpiresAt),
      session, sessionSid: session?.sid || null, cookieHeader, savedAt: new Date().toISOString()
    };
    await this.writeJson(SESSION_KEY, this.session);
    return this.refresh();
  }

  async renewSession() {
    if (this.renewPromise) return this.renewPromise;
    const session = this.getSession();
    if (!session) throw new MobileClientError('登录状态不存在', 'AUTH_EXPIRED');
    this.renewPromise = this.request('/api/user/auth/refresh', { method: 'POST', headers: {
      'X-Auth-Session': session.sessionSid || session.session?.sid || ''
    }, auth: true }).then(async response => {
      const payload = validatePayload(response.body || {}, '续期接口');
      const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
      const token = data.access_token || data.accessToken || data.token;
      if (!token) throw new MobileClientError(payload.message || '会话续期失败', 'AUTH_REFRESH_FAILED');
      this.session = { ...session, accessToken: token, tokenType: data.token_type || data.tokenType || session.tokenType || 'Bearer', accessExpiresAt: asNumber(data.access_expires_at ?? data.accessExpiresAt), session: data.session || session.session, sessionSid: data.session?.sid || session.sessionSid, cookieHeader: mergeCookies(session.cookieHeader, parseCookieHeader(response.headers)), savedAt: new Date().toISOString() };
      await this.writeJson(SESSION_KEY, this.session);
      return this.session;
    }).catch(error => {
      if (error?.code === 'HTTP_401' || error?.code === 'HTTP_403' || error?.code === 'AUTH_REFRESH_FAILED' || error?.code === 'API_ERROR') throw new MobileClientError('登录已过期，请重新连接 Kapibala', 'AUTH_EXPIRED');
      throw error;
    }).finally(() => { this.renewPromise = null; });
    return this.renewPromise;
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._refresh().catch(async error => {
      if(isAuthError(error)) {
        try {await this.renewSession();return await this._refresh();}catch(retry){error=retry;}
      }
      // Authentication expiry is authoritative. Do not replace it with an
      // offline cache state, otherwise the app would appear healthy while a
      // new login is already required.
      if (error?.code === 'HTTP_401' || error?.code === 'HTTP_403' || error?.code === 'AUTH_EXPIRED') return { authenticated: false, username: this.getSession()?.username || '', dataState: 'auth_expired', errorCode: 'AUTH_EXPIRED', provider: 'kapibala.asia' };
      const cached = this.getValidCache();
      if (cached?.data) return { ...cached.data, dataState: 'offline', stale: true, errorCode: error?.code || 'NETWORK_ERROR' };
      throw error;
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async _refresh() {
    let session=this.getSession();
    if(!session){this.authState='signed_out';return {authenticated:false,dataState:'signed_out',provider:'kapibala.asia'};}
    if(this.shouldRenew(session))session=await this.renewSession();
    const now=new Date(),todayStart=startOfDay(now),weekStart=startOfWeek(now),request=p=>this.request(p);
    const statsPath=from=>`/api/log/self/stat?type=2&start_timestamp=${isoSeconds(from)}&end_timestamp=${isoSeconds(now)}`;
    const results=await Promise.allSettled([request('/api/status'),request('/api/user/self'),request('/api/subscription/self'),request('/api/subscription/plans'),request(statsPath(todayStart)),request(statsPath(weekStart))]);
    for(const r of results){if(r.status==='rejected'&&isAuthError(r.reason))throw r.reason;}
    if(results[0].status!=='fulfilled')throw results[0].reason;
    if(results[1].status!=='fulfilled')throw results[1].reason;
    const config=unwrap(results[0].value.body,'状态接口');
    const quotaPerUnit=numeric(config.quota_per_unit??config.QuotaPerUnit);
    const currency=String(config.quota_display_type??config.QuotaDisplayType??'USD').toUpperCase()==='CNY'?'CNY':'USD';
    const exchange=currency==='CNY'?numeric(config.usd_exchange_rate??config.USDExchangeRate):1;
    if(!(quotaPerUnit>0)||!(exchange>0))throw new MobileClientError('计费单位缺失，无法确认费用','SCHEMA_INVALID');
    const scale=exchange/quotaPerUnit,money=n=>n===null?null:Number((n*scale).toFixed(8));
    const userData=unwrap(results[1].value.body,'账户接口'),user=userData.user??userData;
    const quota=resolveQuota(user),account={balance:money(quota.balance),used:money(quota.used),total:money(quota.total),requests:numeric(user.request_count),status:String(user.status??'enabled')};
    const warnings=[];let subscriptions=[],subscriptionsAvailable=false;
    if(results[2].status==='fulfilled'){
      try {subscriptions=parseSubscriptions(results[2].value.body,results[3].status==='fulfilled'?results[3].value.body:null,scale,now);subscriptionsAvailable=true;}catch(error){if(isAuthError(error))throw error;warnings.push(error.message);}
    }else warnings.push('订阅接口暂时不可用');
    const history=await syncHistory(request,{previous:this.getValidCache()?.history,now,expectedRequests:account.requests,createdAt:user.created_at??user.createdAt});
    if(!history.complete)warnings.push(history.warning||'历史同步未完成');
    let recent=[],todayRecords=[],todayComplete=false,weekComplete=false;
    try {
      recent=await fetchLogRange(request,history.complete?todayStart:weekStart,now);
      todayRecords=recent.filter(r=>+timestamp(r.timestamp)>=+todayStart);todayComplete=true;
      if(history.complete)recent=[...history.rows.filter(r=>+timestamp(r.timestamp)>=+weekStart&&+timestamp(r.timestamp)<+todayStart),...recent];
      weekComplete=true;
    }catch(error){
      if(isAuthError(error))throw error;
      warnings.push(error.message||'最近调用读取失败');
      recent=history.rows.filter(r=>+timestamp(r.timestamp)>=+weekStart);todayRecords=recent.filter(r=>+timestamp(r.timestamp)>=+todayStart);
      todayComplete=history.complete;weekComplete=history.complete;
    }
    const today={...aggregate(todayRecords,scale),complete:todayComplete},week={...aggregate(recent,scale),complete:weekComplete};
    for(const [index,target] of [[4,today],[5,week]]) {
      if(results[index].status==='fulfilled') {
        try {const stats=parseStats(results[index].value.body,scale);if(stats.spent!==null)target.spent=stats.spent;target.averageRPM=stats.averageRPM;target.averageTPM=stats.averageTPM;}catch(error){if(isAuthError(error))throw error;warnings.push(error.message);}
      }else warnings.push('消耗统计暂时不可用');
      if(!target.complete){for(const field of ['requests','tokens','inputTokens','outputTokens'])target[field]=null;}
    }
    const historyRecords=weekComplete?[...history.rows.filter(r=>+timestamp(r.timestamp)<+weekStart),...recent]:history.rows;
    const daily=aggregateDaily(historyRecords,scale);
    const sum=key=>subscriptions.some(s=>s[key]===null)?null:subscriptions.reduce((a,s)=>a+s[key],0);
    const data={authenticated:true,username:session.username||user.username||'',provider:'kapibala.asia',currency,currencySymbol:currency==='CNY'?'¥':'$',moneyScale:scale,
      fetchedAt:now.toISOString(),account,today,week,daily,models:{week:aggregateModels(recent,scale,weekStart,now),today:aggregateModels(todayRecords,scale,todayStart,now)},
      modelsComplete:weekComplete&&todayComplete,historyStart:daily[0]?.date,historyEnd:daily.at(-1)?.date,historyComplete:history.complete,historyTruncated:!history.complete,historyMode:history.mode,
      subscriptions,subscriptionsAvailable,subscriptionSummary:{count:subscriptions.length,total:sum('total'),remaining:sum('remaining'),nearestExpiry:subscriptions.map(s=>s.endDate).filter(Boolean).sort()[0]||null},
      warnings,dataState:warnings.length?'partial':'fresh'};
    try {await this.writeJson(CACHE_KEY,{version:DATA_VERSION,owner:this.cacheOwner(),history:history.next,data});}catch {data.cacheWarning='无法保存离线缓存';}
    this.authState='authenticated';return data;
  }

  async logout() {
    // Drain refresh/write work before clearing; an older refresh must not revive the account.
    if (this.refreshPromise) await this.refreshPromise.catch(() => {});
    await this.storageWrites.catch(() => {});
    if (this.nativeStorage?.removeItem) {
      await this.nativeStorage.removeItem(SESSION_KEY);
      await this.nativeStorage.removeItem(CACHE_KEY);
    }
    this.session = null;
    this.nativeCache = null;
    this.authState = 'signed_out';
    try { this.storage?.removeItem(SESSION_KEY); this.storage?.removeItem(CACHE_KEY); } catch {}
    return { authenticated: false, dataState: 'signed_out', provider: 'kapibala.asia' };
  }
}

