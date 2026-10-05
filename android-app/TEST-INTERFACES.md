# 测试接口与验收契约 v4

本版保留的是应用内测试入口、可导出JSON与离线自动化检查；没有开放远程HTTP端口或允许外部读取登录会话的调试服务。

| 入口 | 是否查询学校 | 检查内容 | 完成信号 |
|---|---|---|---|
| 离线模拟 | 否 | 合成 A/B 点位、调频、去重、迟到提醒 | `offline.data.passed` |
| 模拟校园平台（5/20分钟） | 否 | 同一个原生服务处理定时200米更新、规则中断、结束、后台语音 | `simulated=true`，人工听感与speech环境记录；不能仅凭自动结束判通过 |
| 单次接口诊断 | 是，一轮最多两个读取接口 | 当前WebView会话与真实规则/详情 | `state=QUERY_PASS`，结合 api事件 |
| 五轮自动验收 | 是，五轮 | 查询、变化播报、自动停止、用户听感 | `state=BASIC_TEST_COMPLETE` |
| 中文语音试听 | 否 | 中文引擎与实际听感 | `hearing` 用户确认 |
| 权限与传感器诊断 | 否 | 可用性、权限、注册、回调、新鲜度 | diagnostics字段，不能仅看注册 |
| 90秒后台与熄屏检查 | 是，原生HTTP | 无需跑步，验证服务独立查询 | 正常结束且两个后台计数均大于0 |
| 实跑监测 | 是，自适应 | 真实打卡序列与R4算法 | 导出事件与学校记录人工对照 |

## JSON报告

前台分项仍为 `schema=1`；0.4.0原生服务为 `schema=4`（旧0.2.1至0.3.1为3）。共同顶层有 `appVersion`、`reportId`（每报告随机生成）、`testerCode`（可选）、`mode`、`period`、`started/finished`、`state/reason`、`device`、`queries/successfulQueries`、`events`、`motion`、`adaptive`。`device`只有厂家、型号、API与WebView版本，不读取IMEI或系统唯一设备ID。

schema4新增：`simulated`、`transport`、`sampleStale`、`lastSampleAt`、`serviceThread`、`lastSpeechState`、`maxSleepGapMs`、`maxWorkerAwakeGapMs`。模拟模式为`SIMULATION_BACKGROUND`，本机来源为`local-simulation`，带`simulationPlan`及`simulationPlatform`；这些成功查询不是学校网络成功查询。

`adaptive.completedLaps`改为累计距离/400向下取整，`officialLapEquivalent`为折合圈数，`lapScope=official-distance`。`confirmedSegments`仍是本轮新确认区间，仅供调度诊断，不作为累计圈数。详情暂不可用时保留`lastSample`并标`sampleStale=true`；旧倒计时隐藏，15秒重试，持续5分钟以`DATA_UNAVAILABLE`停止。

`speech.requestContext/startContext/endContext`记录各阶段前后台、屏幕、媒体音量、音频模式、引擎与时钟；`focusResult`记录音频焦点结果。语音完成回调不等于人耳听到，仍需`hearing`。实际服务的方法回归在电脑运行时替换了Android依赖，不能替代真机声音和系统调度测试。原地操作见《原地模拟测试指南》。

前台 `events` 保留最近500条，原生服务保留最近1000条；每条有 `at/type/data`。主要类型：

- `preflight`：模拟自检；必须带 SIMULATED 来源。
- `api`：真实查询结果摘要，包括规则/详情阶段、业务是否成功、允许输出的统计数据。持久化前移除checkpoint事件列表与runKey。
- `decision`：R4调度阶段、区间/圈数、预测距离来源及事件提示。预测不能替代官方数据。
- `speech`：文本、请求/开始/完成时间、REQUESTED/STARTED/DONE/ERROR/CANCELLED。DONE只是系统回调。
- `hearing`：明确用户听感确认；与speech回调分开。
- `autoStop`：五轮结束停止验证。
- `offline`：离线合成检查；不能当真实后台证据。

常见reason：SINGLE_DONE、FIVE_DONE、USER_STOP、BACKGROUND、NAVIGATION、API_ERROR、QUERY_TIMEOUT、VOICE_NOT_HEARD、TTS_ERROR、RUN_ENDED。非成功结束目前统一state STOPPED，原因必须同时查看。报告不能把等待起跑状态理解为“已验证运动倒计时”。

## 原生服务新增字段

- `mode`：RUN_BACKGROUND / BACKGROUND_CHECK；`transport=native-http`。
- `backgroundQueries`：发起请求时界面不可见且随后成功的轮数。
- `screenOffQueries`：发起请求时系统非交互或主显示屏为OFF、且随后成功的轮数。两者可重叠；失败不增加。
- `lastSample`：最后一次允许输出的运动摘要；`adaptive`：最后策略判断。
- `api.data`：round、uiVisible、screenOn、elapsedMs、result及motion；motion在响应时采样。
- `service`、`visibility`、`taskRemoved`：服务及界面状态事件。taskRemoved不能证明后续持续存活。
- `termination`：首次停止原因；再次按停止不改写。
- `apiError`：脱敏错误码，包括 HTTP_401、HTTP_429、SESSION_EXPIRED 等，不写响应正文。
- `BACKGROUND_CHECK_COMPLETE`：90秒完成，必须结合两个计数判断，不能单看该状态认定通过。
- `RUN_ENDED`、`NOTIFICATION_STOP`、`USER_STOP`、`EXPORT`、`LIMIT`、`SERVICE_START_FAILED`、`SERVICE_INIT_FAILED`、`SERVICE_DESTROYED`、`SYSTEM_SERVICE_TIMEOUT`、`POLICY_ERROR` 等区分停止原因。

进程直接被杀可能没有 termination；报告停留 RUNNING 仅代表最后落盘状态。服务不自动恢复旧会话。原生测试和WebView测试均不导出token/userId/原始点位；运动摘要与时间仍属于本地测试数据。

## 离线开发检查

`verify.ps1` 运行 APK bundle回归、Java BrowserPolicy断言及原R4全套测试。`build.ps1` 生成并签名安装包；apksigner检查结构与证书，不代表真机可用。`dist/release.json` 记录版本、SHA256及证书指纹，不包含签名私钥。

后续预留扩展：schema通过新增可选字段演进；破坏性变更提升schema；新测试入口需声明是否联网、写入/只读、通过条件及未覆盖边界。远程更新清单或云反馈接口尚未部署，不能把本地文件当成在线服务。

## 0.4.3 反馈提交接口

用户确认后 POST 到自配 HTTPS `/v1/feedback`，上传 `{schema:1, feedbackId, createdAt, appVersion, description, report}`；报告可 null，非空时为脱敏快照，不改变监测状态。上传码与学校会话分离，仅 HTTP Authorization 传输，不写入反馈内容。禁止重定向，校验服务器 `ok:true` 与同一 feedbackId 回执后才标记 SENT。

本地私有 `feedback/<UUID>.json` 包含 payload、目标 endpoint、PENDING/SENT 状态和错误摘要；草稿与接收地址/上传码在应用私有偏好中。原始学校凭据从不提供给此模块。失败原记录重试；目标固定，改服务器后拒绝把新提交码发送到旧目标。服务器本地文件包含 receivedAt、请求摘要和 feedback 对象。此版接收服务源码已附，实际地址尚未配置，不代表公网已上线。

## schema 3 屏幕与调度诊断

新增 displayOffQueries、nonInteractiveQueries、lockedQueries、screenOffResponseQueries 分开计数；screenOffEvents 统计SCREEN_OFF广播（非交互事件）。不能拿lockedQueries当熄屏查询。

新增 queryStarted 事件（在HTTP前落盘）和screen事件；api带screenAtStart/screenAtResponse、requestedAt、durationMs。screen含interactive、displayState/display、keyguardLocked、deviceIdle、batteryOptimizationExempt、elapsedRealtimeMs。未知显示状态不猜成OFF。

lastHeartbeatAt/ElapsedMs、heartbeatCount、maxHeartbeatGapMs、maxQueryDelayMs用于判断调度是否长时间挂起；nextQueryAt和nextQueryElapsedMs用于下一次查询显示，停止或开始请求即清除。进程直接被杀仍可能没有结束事件。

原生成功请求产生的授权指纹只在进程内供重启会话匹配，页面跳转或查询失败时清除，不进入报告。匹配保留5分钟新鲜度、端点一致及凭据匹配检查；不延长实际账号会话，不绕过服务端鉴权。会话交接失败记录sessionHandoff的脱敏diagnostics。

## 0.3.0 展示与导出

主界面通过RunPresentation读取报告摘要，不修改报告。后台/熄屏/辅助采样等诊断在测试页与JSON保留；报告schema、事件容量、脱敏方式不变。新版本不提供外部网络测试端口。新增界面投影主机测试，不替代真机布局检查。
