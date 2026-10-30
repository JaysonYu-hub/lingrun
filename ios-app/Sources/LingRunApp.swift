import SwiftUI

@main struct LingRunApp: App {
    @StateObject private var monitor = Monitor()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            HomeScreen(monitor: monitor)
                .onChange(of: phase) { monitor.scene($0) }
        }
    }
}

struct HomeScreen: View {
    @ObservedObject var monitor: Monitor
    @State private var login = false
    @State private var lab = true
    @State private var period = "amDel"
    @State private var location = false
    @State private var steps = false
    @State private var interval = 10.0
    @State private var duration = 180.0
    @State private var initialMeters = 800.0
    @State private var missing = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(monitor.sample?.meters.map { String(format: "%g 米", $0) } ?? "— 米")
                        .font(.system(size: 42, weight: .bold)).foregroundStyle(.teal)
                    LabeledContent("累计圈数", value: monitor.sample?.lapText ?? "—")
                    LabeledContent("总用时", value: monitor.sample?.totalTime ?? "—")
                    LabeledContent("平台倒计时（最近查询值）", value: !monitor.stale && monitor.running ? monitor.sample?.remaining.map { "\($0) 秒" } ?? "—" : "—")
                    if monitor.stale && monitor.sample != nil { Text("以上为上次数据，等待重新查询。").font(.caption) }
                    Text(monitor.message).foregroundStyle(.secondary)
                    if !monitor.lastVoice.isEmpty { Text(monitor.lastVoice) }
                } header: { Text(lab ? "本地模拟 · 非学校记录" : "本次运动") }
                Section("开始使用") {
                    Toggle("本地模拟测试", isOn: $lab)
                    Picker("考勤", selection: $period) { Text("早操").tag("amDel"); Text("晚操").tag("pmDel") }
                    if !lab {
                        Button("1. 登录学校 → 进入健身长跑") { monitor.browser.openIfNeeded(); login = true }
                        Toggle("运动定位辅助（可选）", isOn: $location)
                        Toggle("采集计步与步频（可选）", isOn: $steps)
                        Text("登录后点网页右上角“返回监测”。不要退出 App。定位不能确认打卡；关闭定位仍可在前台使用。").font(.footnote)
                    }
                }.disabled(monitor.running || monitor.preparing)
                if lab {
                    Section("模拟设置") {
                        Stepper("每 \(Int(interval)) 秒更新一个点位", value: $interval, in: 5...600, step: 5)
                        Stepper("初始距离 \(Int(initialMeters)) 米", value: $initialMeters, in: 0...10000, step: 200)
                        Toggle("模拟第 2 个后续点位漏扫", isOn: $missing)
                    }.disabled(monitor.running || monitor.preparing)
                }
                Section {
                    Stepper("监测上限 \(Int(duration)) 秒", value: $duration, in: 30...7200, step: 30)
                        .disabled(monitor.running || monitor.preparing)
                    Button(monitor.preparing ? "正在准备…" : "开始监测") {
                        monitor.start(lab: lab, period: period, interval: interval, initialMeters: initialMeters,
                                      missing: missing, duration: duration, useLocation: location, useSteps: steps)
                    }.disabled(monitor.running || monitor.preparing)
                    Button("停止监测", role: .destructive) { monitor.stop() }.disabled(!monitor.running && !monitor.preparing)
                    Button("重播最近提示") { monitor.replay() }.disabled(monitor.lastVoice.isEmpty)
                }
                Section("测试与报告") {
                    Button("中文语音试听") { monitor.audition() }
                    Button("保存当前测试 JSON") { monitor.saveReport() }.disabled(monitor.report == nil)
                    if let url = monitor.exportURL { ShareLink("导出最近保存的 JSON", item: url) }
                    Text("报告保存在本机，包含运动数值和运行事件，不包含学校账号、密码、Cookie、Token 或经纬度。请私下分享给维护者。").font(.footnote)
                }
                Section("使用说明") {
                    Text("这是 iOS 本地开发验证版，尚未经过 iPhone 验收。先使用模拟模式验证，再进行学校接口测试。")
                    Text("后台定位仅用于真实运动辅助；iOS 可能暂停程序，不能保证息屏时按固定秒数查询。模拟模式不申请定位，不用无声播放保活。")
                    Text("圈数按学校累计距离 ÷ 400 计算。查询次数和定位距离都不能确认学校打卡。语音首次播报基线，后续在记录变化或异常提醒时播报。")
                    Text("本版没有自动上传、在线更新或反馈服务器。计步和步频仅记录在测试报告中，尚不用于判断漏扫；启用后在开始实跑监测时请求系统授权。")
                }.font(.footnote)
            }
            .navigationTitle("凌跑助手")
            .sheet(isPresented: $login) { LoginScreen(browser: monitor.browser) }
        }
    }
}
