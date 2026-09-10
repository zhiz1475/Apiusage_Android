const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir='D:/Android-Test/results/fixed-20260910',read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));
const first=read('first-sync'),second=read('incremental'),last=read('final');
assert.equal(first.mode,'full');assert.equal(second.mode,'incremental');assert.equal(last.authenticated,true);
assert.equal(last.historical.tokens,4159645464);assert.equal(first.historical.tokens,second.historical.tokens);assert.equal(first.historical.spent,second.historical.spent);
assert.equal(last.selectedDay.requests,83);assert.equal(last.selectedDay.tokens,5088741);assert.equal(last.selectedDay.spent,8.041664);
assert.equal(last.weekModelRequests,871);assert.equal(last.subscriptions.length,3);assert.ok(Math.abs(last.subscriptionRemaining-1707.749026)<.000001);
const apk=path.resolve(__dirname,'../android/app/build/outputs/apk/debug/app-debug.apk'),target='D:/Android-Test/ApiUsageBar-datafix-20260910-debug.apk';
fs.copyFileSync(apk,target);const sha=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');fs.writeFileSync(target+'.sha256',sha+'\n');
const text=`# Android 数据修复验证报告

五项已确认的统计问题已修复，并在实际安装的 Android 调试 APK 上验证。使用测试账号及用户已登录的 Edge 页面进行同范围核对；未提取或保存浏览器登录凭据。

## 修复

1. 原始 quota 与货币金额分开存储，按 quota_per_unit=500000 换算一次，修复历史金额放大 500000 倍。
2. 历史按最多约 28 天的窗口回溯；成功覆盖后才写入全量完成检查点。失败不推进检查点，旧版缓存强制重新同步。第二次成功刷新进入带 3 天重叠的增量。
3. 读取 token_used 和请求 count，保留小时、模型维度；今日请求、Token 由完整日志/聚合记录统计，rpm/tpm 不再当累计数量。
4. 展开 subscriptions[].subscription，关联套餐名称，解析 amount_total、amount_used、end_time；只计算有效订阅。
5. 模型统计使用完整聚合与日志分页；超过接口 10000 条上限时拆分时段，不再只统计前100条。测试同时覆盖毫秒时间戳的拆分边界。

## 实测对账

| 指标 | 修复后 | 核对来源 |
| --- | --- | --- |
| 钱包余额 | $100.48 | Edge 钱包页 |
| 有效订阅 | 3 项 | Edge 钱包页 |
| 订阅剩余 | $1,707.75 | Edge 钱包页与原始订阅金额 |
| 9 月聚合费用 | $692.63 | Edge 自定义 9/1 00:00 至 9/10 的筛选 |
| 9 月请求 | 9,163 次 | Edge 同一范围 |
| 9 月 9 日 | 83 次 / 5,088,741 Token / $8.041664 | 官方聚合接口、网页热力图和安卓日期明细 |
| 本周模型请求 | 871 次 | 完整聚合与日志计数 |
| 历史 Token | 4,159,645,464 | Edge 热力图各日数值精确相加 |
| 可用历史起点 | 2026-06-08 | Edge 热力图与安卓 |

模拟器时区已设为 Asia/Shanghai，与用户的北京时间一致。9 月 10 日当前无调用，显示 0 是正确值；官网概览的“近24小时”与应用“今日”不是同一个时段。

首次全量、第二次增量、覆盖安装后重启均保留相同历史总量。离线刷新回退 v3 缓存，恢复网络后能更新；APK 签名验证通过。

## 数据源差异与边界

官网钱包的账面累计是 42,088 次 / $3,400.730274；历史聚合接口累计为 42,509 次 / $3,394.743414。两个上游来源自身不完全一致，客户端分别保留来源值，不伪造为相等；差异原因需要服务端进一步说明。全量回溯以累计请求覆盖作参考，最多26段，未达到覆盖条件会继续标不完整。

已跑回归：verify-mobile-data-v3.mjs、verify-mobile-day-usage.mjs、verify-mobile-session.mjs、verify-mobile-accent.mjs、mobile:verify 六组尺寸。未声称完成所有机型或长时间稳定性测试。

测试安装包：${target}

SHA-256：${sha}
`;
fs.writeFileSync(path.join(dir,'report.md'),text);console.log(JSON.stringify({report:path.join(dir,'report.md'),apk:target,sha256:sha,verified:true},null,2));
