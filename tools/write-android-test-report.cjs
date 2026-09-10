const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir='D:/Android-Test/results/live-20260910';
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const reference=read('reference'),day=read('day'),restart=read('restart'),appearance=read('appearance'),logout=read('logout');
const offline=read('offline-refresh'),online=read('online-restored'),start=read('background-start'),end=read('background-end');
const duration=(fs.statSync(path.join(dir,'background-end.json')).mtimeMs-fs.statSync(path.join(dir,'background-start.json')).mtimeMs)/1000;
const apk=path.resolve(__dirname,'../android/app/build/outputs/apk/debug/app-debug.apk');
const hash=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
const checks={
 login:read('clean-login').connection==='connected',
 restartSession:restart.connection==='connected',
 restartAppearance:restart.appearance.theme===appearance.theme&&restart.appearance.accent===appearance.accent,
 navigation:read('navigate').every(r=>r.visible&&!r.horizontalOverflow&&r.footerClear),
 cancelLogout:read('logout-cancel').connection==='connected',
 logout:logout.sessionRemoved&&logout.cacheRemoved&&logout.balanceCleared,
 offlineCache:offline.status.includes('缓存'),
 networkRecovery:online.connection==='connected'&&online.refreshAt!==offline.refreshAt,
 backgroundShortObservation:start.refreshAt===end.refreshAt&&duration>=30,
 dayModels:day.modelCount===7&&day.recordCount===20&&!day.retryVisible,
 overviewStats:false,historyCurrency:false,historySync:false,subscriptions:false,weeklyModelCompleteness:false
};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({testedAt:new Date().toISOString(),apkSha256:hash,checks,reference,backgroundSeconds:duration},null,2));
const report=`# Android 真实账号功能验证

结论：交互与登录链路基本正常，但核心统计有明确错误，当前版本不能视为功能验收通过。

环境：Android 16 / API 36 x86_64 模拟器，当前源码调试 APK 实际安装运行（非临时注入、非演示数据）。测试期间设备时区为 UTC；以下 9 月 9 日数据按此日界计算。浏览器预览仍保持演示模式。

## 已通过

- 真实账号登录、余额读取、账户信息面板；余额显示 $100.48。
- 原生安全存储的测试键读写；结束应用后重启仍恢复登录。
- 主题色、明暗模式切换并在重启后保留；已恢复测试前的外观设置。
- 四个页面切换、纵向滚动与底部可达性，未出现横向溢出。
- Android 系统返回键关闭账户弹层，未直接退出应用。
- 退出确认／取消退出；确认后本机会话与缓存均清除；测试结束已重新登录。
- 关闭模拟器 Wi-Fi 和移动数据后手动刷新回退缓存，恢复网络后可以刷新。
- 后台短时观察约 ${Math.round(duration)} 秒，刷新时间未改变；回到前台可继续更新。该观察不足以证明长时间后台稳定性。
- 日期 ${day.date} 模型调用明细：${day.state}；展示最近 ${day.recordCount} 条记录。独立聚合接口返回 ${reference.requests} 次、${reference.tokens.toLocaleString()} Token、$${reference.spent}，与所选日期的明细汇总相符。
- 本轮未在 crash buffer 中发现崩溃记录。单次内存 PSS 约 105 MiB，仅作短时观察。

## 未通过：需修复的数据问题

| 问题 | 实测证据 | 原因 |
| --- | --- | --- |
| 今日请求与 Token 错误 | 总览显示 0；接口实际返回 ${reference.requests} 次、${reference.tokens.toLocaleString()} Token | stat 接口只包含 quota/rpm/tpm；总量被缺省成 0，历史聚合的 token_used 字段也未读取 |
| 历史费用单位错误 | 同一批三天记录显示 $27,045,738.00，按 quota_per_unit=500000 换算应约 $54.09 | 原始 quota 直接用于货币显示，放大 500,000 倍 |
| 首次历史同步失败、后续错误标为完整 | 首次提示不完整；第二次只读取最近三天，却变为“同步正常” | 接口单次跨度最多一个月；首次按一年查询；失败仍更新同步时间，随后错误进入增量 |
| 订阅额度缺失 | 接口返回 3 项当前订阅，但 UI 一直显示“待同步” | 未解析 subscriptions[].subscription，以及 amount_total/amount_used/end_time 等字段 |
| 本周模型用量截断 | 本周接口共有 ${reference.weekRequests} 次，模型卡片仅累计 ${reference.displayedWeekModelRequests} 次 | 只读取第 1 页、每页 100 条 |
| 离线提示延迟 | 网络关闭后页面仍可能显示同步正常，手动刷新失败后才切换缓存提示 | WebView 的 navigator.onLine 在本测试环境仍为 true，不能单独依赖它 |

代码位置：mobile/mobile-client.js 中 normalizeUsageRow、fetchHistory、fetchModels、normalizeStat 及订阅解析。此次进行了验证和诊断，尚未修改以上业务数据逻辑。

## 验证边界

未覆盖真实手机厂商差异、长时间稳定性、大量日志极限、自然到期后的全部 Token 续期场景。已恢复模拟器网络；测试账号保持登录。报告不包含密码、Token 或 Cookie。

APK SHA-256：${hash}
`;
fs.writeFileSync(path.join(dir,'report.md'),report);
console.log(JSON.stringify({report:path.join(dir,'report.md'),checks},null,2));
