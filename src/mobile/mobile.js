import { MobileKapibalaClient, asDate } from './mobile-client.js';
import { createMobileUI } from './mobile-ui.js';
import { createCalendar } from './mobile-calendar.js';
import { lastSevenDays, subscriptionFunds, finite, localDate } from './mobile-view-model.js';
import {modelIcon} from './mobile-model-icons.js';
import {createDayPanel} from './mobile-day-panel.js';
import {createAccentPicker} from './mobile-accent.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const isNative = Boolean(globalThis.Capacitor?.isNativePlatform?.() || globalThis.Capacitor?.getPlatform?.() === 'android');
const previewMode = !isNative && !new URLSearchParams(location.search).has('live');
const client = new MobileKapibalaClient();
const state = { data: null, modelRange: 'week', theme: localStorage.getItem('apiusagebar-mobile-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'), loading: false, selectedDate: '' };
let lastRefresh = 0, authBusy = false, renderEpoch = 0;
const dayPanel=createDayPanel({client,getData:()=>state.data,preview:previewMode,money,compact,count});
const calendar = createCalendar({money,compact,count,onSelect:(key,options)=>dayPanel.select(key,options),picker:{open:()=>ui.openSheet('monthSheet'),close:()=>ui.closeSheet()}});
const ui = createMobileUI({ onResume: () => maybeRefresh() });
const accents=createAccentPicker({ui,getTheme:()=>state.theme});

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function compact(value) { if(value===null||value===undefined)return '—';const n = number(value); if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`; if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`; return n.toLocaleString('en-US'); }
function count(value) { return value === null || value === undefined ? '—' : number(value).toLocaleString('en-US'); }
function money(value, data = state.data) { if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'; return `${data?.currencySymbol || '$'}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateOnly(value) { const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? localDate(value) : asDate(value); return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''; }
function dateLabel(value, year = false) { const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? localDate(value) : asDate(value); return date ? new Intl.DateTimeFormat('zh-CN', year ? { year: 'numeric', month: 'numeric', day: 'numeric' } : { month: 'numeric', day: 'numeric' }).format(date) : '—'; }
function toast(message, error = false) { const node = $('#mobileToast'); $('#toastText').textContent = message; node.classList.toggle('error', error); node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600); }

function demoData() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daily = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - (364 - index));
    const active = index > 354 ? [80, 146, 62, 205, 272, 188, 232][index % 7] : (index % 13 === 0 ? 24 + (index * 19) % 130 : index % 8 === 0 ? 12 + (index * 11) % 64 : 0);
    return { date: dateOnly(date), spent: active * .0051, requests: active, tokens: active * 1840, inputTokens: active * 1160, outputTokens: active * 680 };
  });
  const recentAmounts=[8.40,6.22,14.18,17.60,10.74,18.32,12.84];
  daily.slice(-7).forEach((row,i)=>{row.spent=recentAmounts[i];});
  Object.assign(daily.at(-1),{requests:2418,tokens:4820000,inputTokens:3070000,outputTokens:1750000});
  return {
    authenticated: true, username: '预览账户', currency: 'USD', currencySymbol: '$', fetchedAt: new Date(Date.now()-120000).toISOString(), dataState: 'preview', historyComplete:true,
    account: { balance: 248.6, used: 71.4, total: 320 },
    today: { spent: 12.84, requests: 2418, tokens: 4820000, inputTokens: 3070000, outputTokens: 1750000, averageRPM: 3.1 },
    week: { spent: 88.3, requests: 8920, tokens: 19340000 }, daily,
    historyStart: daily[0].date, historyEnd: daily.at(-1).date,
    subscriptionSummary: { count: 2, total: 200, remaining: 147.76, nearestExpiry: new Date(today.getTime() + 15 * 86400000).toISOString() },
    subscriptions: [
      { id: 'KP-240831', title: 'Pro · Coding Plan', total: 120, used: 37.92, remaining: 82.08, remainingPercent: .684, endDate: new Date(today.getTime() + 15 * 86400000).toISOString() },
      { id: 'KP-240824', title: 'Team · Coding Plan', total: 80, used: 14.32, remaining: 65.68, remainingPercent: .821, endDate: new Date(today.getTime() + 26 * 86400000).toISOString() }
    ],
    models: { week: [
      { model: 'gpt-4o', logo: 'openai', requests: 1102, tokens: 2380000, spent: 41.26 },
      { model: 'claude-3-5-sonnet', logo: 'anthropic', requests: 684, tokens: 1460000, spent: 28.8 },
      { model: 'gemini-1.5-pro', logo: 'gemini', requests: 425, tokens: 720000, spent: 11.62 },
      { model: 'deepseek-chat', logo: 'deepseek', requests: 207, tokens: 260000, spent: 6.62 },
      { model: 'glm-4-plus', logo: 'glm', requests: 178, tokens: 190000, spent: 4.18 }
    ], today: [] }
  };
}

function emptyData() {
  return {
    authenticated: false, provider: 'kapibala.asia', currency: 'USD', currencySymbol: '$', dataState: 'signed_out', fetchedAt: null,
    account: {}, today: {}, week: {}, daily: [], subscriptions: [], subscriptionSummary: { count: 0, total: 0, remaining: 0 }, models: { week: [], today: [] }
  };
}

function applyTheme(theme, announce = false) {
  state.theme = theme === 'night' ? 'night' : 'day';
  document.body.dataset.theme = state.theme;
  $('#themeToggleLabel').textContent = state.theme === 'night' ? '夜间' : '日间';
  $('#themeToggle').setAttribute('aria-pressed', String(state.theme === 'night'));
  $('#themeToggle').setAttribute('aria-label', state.theme === 'night' ? '当前夜间，切换至日间' : '当前日间，切换至夜间');
  localStorage.setItem('apiusagebar-mobile-theme', state.theme);
  accents.refresh();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'night' ? '#1d1d1f' : '#f0f0f0');
  if (announce) toast(state.theme === 'night' ? '已切换到夜间主题' : '已切换到白天主题');
}

function setStatus(data, preview = false) {
  const banner = $('#statusBanner');
  const mark = $('.status-mark', banner);
  const text = $('#statusText');
  const action = $('#statusAction');
  const authenticated = Boolean(data?.authenticated);
  const expired = data?.dataState === 'auth_expired' || data?.errorCode === 'AUTH_EXPIRED';
  const offline = data?.dataState === 'offline' || data?.stale;
  const failed = data?.dataState === 'error';
  banner.dataset.state=failed?'error':data?.dataState||'signed_out';
  mark.className = `status-mark ${authenticated && !offline ? 'is-fresh' : expired ? 'is-error' : ''}`;
  if (preview) text.textContent = '演示数据';
  else if (data?.dataState === 'syncing') text.textContent = '已连接 · 首次同步中';
  else if (expired) text.textContent = '登录已过期 · 需要重新连接';
  else if (failed) text.textContent = '同步失败 · 请重试';
  else if (offline) text.textContent = '缓存数据 · 等待网络恢复';
  else if (authenticated) text.textContent = `已连接 · ${data.dataState === 'partial' ? data.historyComplete===false?'历史数据不完整':'部分数据待同步' : '同步正常'}`;
  else text.textContent = '尚未连接 · 登录后查看用量';
  action.textContent = failed ? '重试' : preview || !authenticated || expired ? '连接' : '账户';
  const connection=expired?'expired':authenticated&&!preview?'connected':'signed-out';
  const connectionLabel=connection==='connected'?'已连接':connection==='expired'?'已过期':'未连接';
  $('#accountButton').dataset.connection=connection;
  $('#accountButton').setAttribute('aria-label',connectionLabel+'，账户管理');
  $('.account-text').textContent=connectionLabel;
  $('.account-dot')?.classList.toggle('connected', authenticated && !expired && !preview);
  $('.account-dot')?.classList.toggle('expired', expired);
  $('#syncLabel').textContent = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
  const refreshed=data?.fetchedAt ? new Date(data.fetchedAt) : null;
  const stamp=$('#lastRefreshTime');
  const valid=refreshed&&!Number.isNaN(refreshed.getTime());
  stamp.textContent=valid ? (preview?'示例 ':'')+refreshed.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '尚未刷新';
  stamp.dateTime=valid?refreshed.toISOString():'';
  stamp.title=valid?refreshed.toLocaleString('zh-CN'):'尚未成功刷新';
  $('#settingsAccountValue').textContent = authenticated ? (data.username || '已连接') : expired ? '登录已过期' : '未连接';
}

function renderOverview(data) {
  const today = data.today || {}; const week = data.week || {}; const account = data.account || {};
  const missingUsage = !data.authenticated || today.complete===false || (today.complete===undefined&&data.historyComplete===false);
  $('#todaySpent').textContent = money(today.spent, data);
  $('#todayRequests').textContent = missingUsage && !today.requests ? '—' : count(today.requests);
  $('#todayRequestDetail').textContent = missingUsage ? '等待完整同步' : '今日累计调用';
  $('#todayTokens').textContent = missingUsage && !today.tokens ? '—' : compact(today.tokens);
  $('#todayTokenDetail').textContent = missingUsage && !today.tokens ? '等待完整同步' : `输入 ${compact(today.inputTokens)} · 输出 ${compact(today.outputTokens)}`;
  $('#accountBalance').textContent = money(account.balance, data);
  const funds=subscriptionFunds(data);
  $('#subscriptionBalance').textContent=money(funds.remaining,data);
  $('#accountBalanceDetail').textContent=data.authenticated ? funds.remaining===null?'订阅额度待同步':`${funds.plans.length} 项订阅 · 查看明细` : '钱包与订阅分别显示';
  const yesterday=new Date(); yesterday.setDate(yesterday.getDate()-1);
  const prior=(data.daily||[]).find(r=>r.date===dateOnly(yesterday))?.spent;
  $('#todayTrend').textContent = !data.authenticated ? '等待连接账户' : data.stale ? '缓存数据' : data.historyComplete===false ? '部分同步' : finite(prior)>0&&finite(today.spent)!==null ? `较昨日 ${today.spent>=prior?'+':''}${((today.spent-prior)/prior*100).toFixed(1)}%` : '今日累计消耗';
  $('#weekTotal').textContent = money(week.spent, data);
  renderBars(data);
  renderSubscriptions(data);
}

function renderHistorySummary(data) {
  const rows = Array.isArray(data.daily) ? data.daily : [];
  $('#historyRange').textContent = rows.length ? `${dateLabel(rows[0].date, true)} — ${dateLabel(rows.at(-1).date, true)}` : '';
  const incomplete = data.historyComplete === false;
  $('#historyStateCard').hidden=!(incomplete||data.stale);
  $('#historyStateTitle').textContent = incomplete ? '历史数据不完整' : '正在显示缓存';
  $('#historyStateText').textContent = incomplete ? '部分记录尚未同步，请点击刷新重试。' : '网络恢复后自动更新。';
}

function renderBars(data) {
  const rows=lastSevenDays(data);const values=rows.map(r=>r.spent);const max=Math.max(.01,...values.filter(v=>v!==null));
  const empty=values.every(v=>v===null);
  $('#mobileBars').hidden = empty; $('#barAxis').hidden = empty; $('#chartEmpty').hidden = !empty;
  $('#chartEmpty').textContent = data.authenticated ? '暂无消耗记录' : '连接账户后查看消耗趋势';
  const total=values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
  $('#weekTotal').textContent=total===null?'数据待补全':`合计 ${money(total,data)}`;
  $('#mobileBars').innerHTML = rows.map((row,index)=>`<button type="button" class="mobile-bar ${index===6?'is-today':''}" data-trend-date="${row.date}" aria-label="${esc(dateLabel(row.date))}，消耗 ${esc(money(row.spent,data))}" style="--bar-height:${row.spent===null?0:Math.max(1,row.spent/max*100)}%"><span class="mobile-bar-value">${row.spent===null?'—':Math.abs(row.spent)>=1000?compact(row.spent):row.spent.toFixed(2)}</span><span class="mobile-bar-fill"></span><span class="mobile-bar-label">${index===6?'今天':dateLabel(row.date)}</span></button>`).join('');
  $('#trendDetail').hidden=true;
  // The individual bars carry their own day labels; keeping a second axis
  // would repeat the first/last labels on a narrow screen.
  $('#barAxis').innerHTML = '';
}

function renderSubscriptions(data) {
  const plans = subscriptionFunds(data).plans;
  $('#subscriptionCount').textContent = !data.authenticated?'未连接':data.subscriptionsAvailable===false?'待同步':`${plans.length} 个有效`;
  $('#subscriptionList').innerHTML = plans.length ? plans.map(plan => {
    const pct = Math.max(0, Math.min(100, number(plan.remainingPercent) * 100 || (number(plan.total) ? number(plan.remaining) / number(plan.total) * 100 : 0)));
    return `<div class="subscription-row"><div><div class="subscription-title">${esc(plan.title || 'Coding Plan')}</div><div class="subscription-date">到期 ${esc(dateLabel(plan.endDate, true))} · 剩余 ${money(plan.remaining, data)}</div></div><strong class="subscription-percent">${pct.toFixed(0)}%</strong><div class="subscription-track"><span style="width:${pct.toFixed(1)}%"></span></div></div>`;
  }).join('') : `<div class="empty-copy">${!data.authenticated?'连接账户后查看订阅':data.subscriptionsAvailable===false?'订阅额度暂未获取':'暂无订阅计划'}</div>`;
}

function renderModels(data) {
  const models = Array.isArray(data.models?.[state.modelRange]) ? data.models[state.modelRange] : [];
  const total = models.reduce((sum, item) => sum + number(item.spent), 0);
  $('#modelsSummary').textContent=models.length?`${models.length} 个模型 · 消耗 ${money(total,data)}`:'';
  $('#mobileModels').innerHTML = models.length ? models.map(model => { const share=total>0?number(model.spent)/total:0; return `<article class="model-card"><div class="model-title">${modelIcon(model.logo || model.model)}<span>${esc(model.model || '未知模型')}</span></div><span class="model-share"><small>费用占比</small>${(share*100).toFixed(1)}%</span><span class="model-stat">请求 <strong>${esc(count(model.requests))}</strong></span><span class="model-stat">Token <strong>${esc(compact(model.tokens))}</strong></span><span class="model-stat">费用 <strong>${esc(money(model.spent, data))}</strong></span></article>`; }).join('') : '<div class="mobile-card empty-copy">暂无模型调用记录</div>';
}

function render(data, { preview = false } = {}) { state.data = data; renderOverview(data); renderHistorySummary(data); calendar.update(data); renderModels(data); setStatus(data, preview); }

function openDetail(kind) {
  const data=state.data || emptyData(), today=data.today||{}, funds=subscriptionFunds(data);
  const list=rows=>`<dl class="detail-list">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
  const unknown=data.historyComplete===false || !data.authenticated;
  const usage=value=>unknown&&!value?'—':count(value);
  const content={
    spent:['今日消耗',list([['今日累计',money(today.spent,data)],['昨日消耗',money(lastSevenDays(data)[5]?.spent,data)]])],
    requests:['今日请求',list([['请求次数',usage(today.requests)],['平均每分钟',today.averageRPM==null?'—':String(today.averageRPM)]])],
    tokens:['今日 Token',list([['合计',usage(today.tokens)],['输入',usage(today.inputTokens)],['输出',usage(today.outputTokens)]])],
    funds:['钱包与订阅',list([['钱包余额',money(data.account?.balance,data)],['钱包累计已用',money(data.account?.used,data)],['钱包总额度',money(data.account?.total,data)]])+`<h3 class="detail-subtitle">订阅额度</h3>`+list([['剩余额度',money(funds.remaining,data)],['有效订阅',data.authenticated&&data.subscriptionsAvailable!==false?String(funds.plans.length):'—']])+funds.plans.map(plan=>`<div class="detail-plan"><strong>${esc(plan.title)}</strong><span>剩余 ${esc(money(plan.remaining,data))} · 到期 ${esc(dateLabel(plan.endDate,true))}</span></div>`).join('')+'<p class="detail-note">订阅额度按各计划适用范围使用，与钱包余额分开计算。</p>']
  }[kind];
  if(!content)return;
  $('#detailTitle').textContent=content[0];$('#detailContent').innerHTML=content[1];ui.openSheet('detailSheet');
}

function openLogin() { $('#loginError').textContent = ''; $('#togglePassword').textContent = '显示'; $('#togglePassword').setAttribute('aria-pressed', 'false'); ui.openSheet('loginSheet'); }
function openAccount() {
  const stored=previewMode?{authenticated:false}:client.getStoredStatus();
  const data=state.data||{},demo=previewMode&&data.dataState==='preview',expired=data.dataState==='auth_expired';
  const connected=stored.authenticated&&!expired;
  $('#accountName').textContent=demo?'演示账号信息，尚未真实登录':connected?'当前登录账户':expired?'登录已过期，账号信息已保留':'尚未登录';
  $('#profileUsername').textContent=demo?'预览账户':stored.username||data.username||'—';
  $('#profileState').textContent=demo?'演示状态':expired?'登录过期':connected?'已连接':'未连接';
  $('#profileWallet').textContent=money(demo||connected?data.account?.balance:null,data);
  $('#profileSubscription').textContent=money(demo||connected?subscriptionFunds(data).remaining:null,data);
  $('#profileUpdated').textContent=$('#lastRefreshTime').textContent;
  $('#accountLogin').hidden=connected;$('#accountLogin').textContent=expired?'重新登录':demo?'登录真实账户':'登录账户';
  $('#logoutConfirm').hidden = true; $('#logoutButton').hidden = !stored.authenticated; $('#accountError').textContent = '';
  ui.openSheet('accountSheet');
}
function setRefreshBusy(busy) {
  [$('#refreshButton'), $('#historyRefresh')].forEach(button => {button.disabled = busy; button.setAttribute('aria-busy', String(busy)); button.lastElementChild.textContent = busy ? '同步中' : '刷新';});
}
async function refresh({ interactive = false } = {}) {
  if (state.loading || authBusy) return;
  if (previewMode) { if (interactive) toast('当前为演示数据，安装后连接真实账户'); return; }
  state.loading = true; setRefreshBusy(true);
  const epoch = renderEpoch;
  try {
    const stored = client.getStoredStatus();
    if (!stored.authenticated) { if (interactive) openLogin(); else toast('请先连接 Kapibala 账户'); return; }
    const data = await client.refresh();
    if (epoch !== renderEpoch) return;
    render(data); lastRefresh = Date.now();
    if (interactive) toast(data.dataState === 'auth_expired' ? '登录已过期，请重新连接' : data.stale ? '网络不可用，已保留缓存' : data.dataState === 'partial' ? '账户已更新，历史仍需重试' : '数据已更新');
  } catch (error) {
    if (epoch !== renderEpoch) return;
    if (interactive) toast(error?.message || '同步失败，请稍后重试', true);
    setStatus({ ...state.data, dataState: 'error' });
  }
  finally { state.loading = false; setRefreshBusy(false); }
}

async function submitLogin() {
  if (authBusy || $('#loginSubmit').disabled) return;
  if (previewMode) { $('#loginError').textContent = '这是界面预览，不会发送账号密码。请在安装后的应用内登录。'; $('#loginPassword').value = ''; return; }
  const username = $('#loginUsername').value.trim(); const password = $('#loginPassword').value; $('#loginError').textContent = '';
  if (!username || !password) { $('#loginError').textContent = '请输入账号和密码'; return; }
  authBusy = true; renderEpoch++; dayPanel.reset(); $('#loginSubmit').disabled = true; $('#loginSubmit').textContent = '正在连接…';
  try { const data = await client.login(username, password); ui.closeSheet(); render(data); ui.showSection('overview', { reset: true }); lastRefresh = Date.now(); toast(data.dataState === 'partial' ? '账户已连接，历史数据待补全' : '账户已连接'); }
  catch (error) { $('#loginError').textContent = error?.message || '登录失败，请检查账号和密码'; }
  finally { authBusy = false; $('#loginPassword').value = ''; $('#loginSubmit').disabled = false; $('#loginSubmit').innerHTML = '安全登录 <span>→</span>'; }
}

async function logout() {
  if(previewMode)return;
  if (authBusy) return;
  authBusy = true; renderEpoch++; dayPanel.reset(); $('#logoutConfirmButton').disabled = true;
  try { await client.logout(); render(emptyData()); ui.closeSheet(); ui.showSection('overview', {reset:true}); toast('已退出并清除本机缓存'); }
  catch { $('#accountError').textContent = '本机凭据清理失败，请重试。'; }
  finally { authBusy = false; $('#logoutConfirmButton').disabled = false; }
}

// Navigation and touch actions.
$$('.bottom-nav-item,.section-jump').forEach(button => button.addEventListener('click', () => ui.showSection(button.dataset.target, {reset: ui.active === button.dataset.target})));
$('#accountButton').addEventListener('click', openAccount);
$('#statusAction').addEventListener('click', () => $('#statusAction').textContent === '重试' ? refresh({ interactive:true }) : openAccount());
$('#refreshButton').addEventListener('click', () => refresh({ interactive: true }));
$('#historyRefresh').addEventListener('click', () => refresh({ interactive: true }));
$('#themeToggle').addEventListener('click', () => applyTheme(state.theme === 'night' ? 'day' : 'night', true));
$('#settingsAccount').addEventListener('click', openAccount);
$('#settingsRefresh').setAttribute('aria-expanded', 'false');
$('#settingsRefresh').addEventListener('click', () => { $('#syncInfo').hidden = !$('#syncInfo').hidden; $('#settingsRefresh').setAttribute('aria-expanded', String(!$('#syncInfo').hidden)); });
$$('.segment').forEach(button => button.addEventListener('click', () => { state.modelRange = button.dataset.modelRange; $$('.segment').forEach(item => item.classList.toggle('active', item === button)); if (state.data) renderModels(state.data); }));
$('#loginClose').addEventListener('click', () => ui.closeSheet());
$('#accountClose').addEventListener('click', () => ui.closeSheet());
$('#accountLogin').addEventListener('click',openLogin);
$('#loginForm').addEventListener('submit', event => {event.preventDefault(); submitLogin();});
$('#loginUsername').addEventListener('keydown', event => {if(event.key==='Enter'){event.preventDefault(); $('#loginPassword').focus();}});
$('#togglePassword').addEventListener('click', event => {const input = $('#loginPassword'); input.type = input.type === 'password' ? 'text' : 'password'; event.currentTarget.textContent = input.type === 'password' ? '显示' : '隐藏'; event.currentTarget.setAttribute('aria-label', input.type === 'password' ? '显示密码' : '隐藏密码'); event.currentTarget.setAttribute('aria-pressed', String(input.type !== 'password'));});
$('#logoutButton').addEventListener('click', () => {$('#logoutButton').hidden=true; $('#logoutConfirm').hidden=false; $('#logoutCancel').focus();});
$('#logoutCancel').addEventListener('click', () => {$('#logoutButton').hidden=false; $('#logoutConfirm').hidden=true; $('#logoutButton').focus();});
$('#logoutConfirmButton').addEventListener('click', logout);
$('#detailClose').addEventListener('click',()=>ui.closeSheet());
$('#detailDone').addEventListener('click',()=>ui.closeSheet());
$$('[data-detail]').forEach(card=>{
  card.addEventListener('click',()=>openDetail(card.dataset.detail));
  card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}});
});
$('#mobileBars').addEventListener('click',event=>{
  const bar=event.target.closest('[data-trend-date]');if(!bar)return;
  const row=lastSevenDays(state.data).find(r=>r.date===bar.dataset.trendDate);
  $('#trendDetail').textContent=`${dateLabel(row.date,true)} · 消耗 ${money(row.spent,state.data)}`;
  $('#trendDetail').hidden=false;
  $$('.mobile-bar').forEach(b=>b.setAttribute('aria-pressed',String(b===bar)));
});

applyTheme(state.theme);
const initialData = previewMode ? demoData() : emptyData();
render(initialData, { preview: previewMode });

// In a native build a stored session is restored silently. Browser preview is
// intentionally deterministic, so it never contacts the provider until the
// user explicitly chooses the live mode.
(async () => {
  try {
    if (previewMode) return;
    await client.hydrate();
    if (client.getStoredStatus().authenticated) {const cached = client.getCachedData(); if(cached) render({...cached, stale:true}); else setStatus({...emptyData(),authenticated:true,username:client.getStoredStatus().username,dataState:'syncing'}); await refresh();}
  } catch (error) {
    if (!previewMode) toast(error?.message || '设备安全存储不可用', true);
  }
})();
function maybeRefresh() { if (!previewMode && !authBusy && document.visibilityState === 'visible' && client.getStoredStatus().authenticated && Date.now()-lastRefresh > 30000) refresh(); }
document.addEventListener('visibilitychange', maybeRefresh);
window.addEventListener('offline', () => { if (!previewMode && state.data?.authenticated) {state.data = {...state.data, dataState:'offline', stale:true}; setStatus(state.data);} });
window.addEventListener('online', () => { if (!previewMode && client.getStoredStatus().authenticated) refresh(); });
setInterval(() => {
  maybeRefresh();
}, 60000);




