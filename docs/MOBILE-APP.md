# ApiUsageBar Android 移动版

移动入口位于 `mobile/`，桌面 Electron 入口保持在项目根目录。移动版采用 Capacitor 8 混合壳，页面以手机宽度为第一优先级：安全区、2×2 今日指标、底部导航、横向热力图、模型卡片和底部登录抽屉均独立设计。

## 2026-09-10 界面重构

- `mobile-ui.js` 管理页面导航、独立滚动位置、弹层焦点、可视区高度、返回动作和页面进入动画。
- `mobile-calendar.js` 以月份选择器和七列日历呈现历史，每次最多 42 格，避免横向拖动；点日期查看消耗、请求和 Token。`mobile-view-model.js` 提供日期、趋势和独立订阅余额的纯函数。
- `mobile.js` 负责数据到 UI 的映射、交互操作与刷新调度；自动同步不再弹出成功通知。
- 页面采用固定高度的 Grid 容器，正文为唯一主滚动区，导航参与布局，不覆盖内容。
- 账户管理先打开面板，退出需要确认；退出后清除凭据、缓存和页面数据，并等待正在进行的同步结束。
- 登录表单独立滚动，操作按钮保持可见；键盘改变可视区时更新高度。预览模式不会提交登录信息。
- 原生返回键接入 `@capacitor/app`：先关闭弹层，再返回总览，最后将应用放到后台。新增原生插件需要重新构建安装后验收。
- 保留黑白灰、暗红、直角和卡皮巴拉 Logo；品牌字标重新设计。动效支持系统“减少动态效果”偏好。

## 预览批注调整

账户余额卡片分别显示钱包余额与有效订阅剩余，点按展示明细，不把两种额度混为可通用的现金余额。订阅接口失败或格式未识别时显示待同步。近七日柱形逐日标注费用，可点选查看完整金额；图表总额由同组日期计算。模型百分比明确标注“费用占比”，移除重复条形。顶栏显示连接状态与上次刷新时间，演示时间带有“示例”标识。正常状态不显示历史帮助卡，只在缓存或不完整时提示。四项 KPI 支持按压反馈和键盘访问的明细面板。

后续批注：品牌改用矢量几何字标，时间融入状态栏，账户入口不带边框。`assets/logos/night/` 包含现有 9 类模型的浅色夜间图标，未知模型使用通用图标。账户入口始终先显示账号摘要，主动点击登录才打开表单，浏览器明确区分演示账号和真实登录。

主题色与明暗模式独立：顶部按钮切换日间/夜间，设置中的“主题色”提供酒红、雾蓝、松绿、靛紫、琥珀、石墨，默认酒红。选择即时应用并保存到 `apiusagebar-mobile-accent`，`mobile-accent.js` 统一管理两种模式下的强调文字、按钮、图表、日历和内联字标配色；品牌模型图标和卡皮巴拉原色保留。`verify-mobile-accent.mjs` 校验两种模式下的配色对比度及非法设置回退。

月份选择采用独立底部面板，按年份导航并以月份网格选择，超出历史范围的月份禁用。取消、遮罩和返回键不会修改当前月份，选择有效月份后立即更新日历并关闭面板，保持正文滚动位置。

选中日期后可以展开当天模型统计。`mobile-day-usage.js` 按设备本地日界线分页读取 `/api/log/self?type=2`，最多 50 页（5000 条），按模型累计请求、输入/输出 Token 和费用，并展示最近 20 条记录；分页失败、重复或达到上限时标为不完整。缓存仅在内存中保存最近 20 个日期，授权过期不回退到缓存。切换日期会终止后续分页并忽略过时响应。浏览器使用明确标记的模拟明细，不发出账号请求。验证：`node verify-mobile-day-usage.mjs`；原生真实数据仍需要安装后复核。

验证命令：`npm run mobile:verify` 覆盖六种横竖屏/短视口尺寸、纵向滚动、底部可达性、导航位置恢复、热力图节点数量、弹层与返回逻辑、退出确认；`node verify-mobile-session.mjs` 覆盖退出与进行中的刷新/缓存写入竞争。

预览在 Android WebView 中可临时载入本地修改而不生成 APK，演示数据始终有标识。先生成 `npx esbuild mobile/mobile.js --bundle --format=iife --platform=browser --outfile=dist/mobile-preview/native-preview.js`，再使用 `node tools/android-preview-inject.cjs --demo`（需要调试 WebView 转发到 9228）。此工具仅用于本地测试，重新加载页面恢复已安装 APK；不代表新原生插件已安装。

## 数据层修复（2026-09-10）

`mobile-data-core.js` 统一规范化原始 quota、秒/毫秒时间戳、请求数、`token_used` 和模型维度；汇总时按服务器的 `quota_per_unit` 换算一次，缺失字段保留未知值。统计接口的 rpm/tpm 不作为累计请求/Token。订阅从 `subscriptions[].subscription` 展开，并关联 `plans[].plan` 的套餐名称，使用 `amount_total/amount_used/end_time` 计算有效额度。

`mobile-sync.js` 使用不超过 28 天的时间段完成历史回溯，账户累计请求数作为覆盖范围参考，默认最多 26 段；未达到覆盖条件或任一段失败时保持不完整，不写入全量完成检查点。成功后才允许从上次成功时间前 3 天增量同步；失败保留旧检查点，空窗口会替换旧窗口内容。当前账号历史已与官网热力图的 4,159,645,464 Token 对齐。累计账面消费/请求与聚合历史属于两个服务端来源，不强行改写为相同数字。

本周模型优先从完整聚合历史和当日日志汇总；需要日志回退时读取全部分页，服务端 10,000 条上限按时间拆分，重复页与不完整分页不标为成功。缓存采用 v3 格式并绑定账号；旧版错误金额缓存会被忽略、重新同步，登录凭据保留。

验证：`node verify-mobile-data-v3.mjs`、`node verify-mobile-day-usage.mjs`、`node verify-mobile-session.mjs`、`npm run mobile:verify`。已在实际安装的 Android 调试 APK 上完成全量、增量和真实账号对账。UI 变更仍先启动预览确认。

## 预览

```powershell
npm run mobile:preview
```

然后打开 `http://127.0.0.1:4173/`。也可以生成 360×800、412×915 的日间/夜间截图：

```powershell
npm run mobile:preview:capture
npm run mobile:verify
```

浏览器预览使用可辨识的演示数据，不会提交账号密码；真机运行时才启用 Kapibala API。

## Android 工程

`android/` 是已生成的 Capacitor 工程，页面同步命令为：

```powershell
npm run cap:sync
```

正式构建需要 JDK 21、Android SDK Platform 36、Build Tools 36.x 和 Gradle 8.14.x。登录会话通过 `@aparajita/capacitor-secure-storage` 写入 Android Keystore 加密存储，网络请求使用 CapacitorHttp 绕过 Kapibala API 的 WebView CORS 限制；历史数据按首次完整同步、后续重叠增量窗口合并，失败时回退离线缓存。

安装器生成前需要先确认手机 UI 预览。确认后可执行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

调试包位于 `android/app/build/outputs/apk/debug/app-debug.apk`。发布包还需要用户自己的签名密钥，当前工程没有内置签名材料。
