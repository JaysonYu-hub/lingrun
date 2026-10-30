import SwiftUI

@MainActor final class Monitor: ObservableObject {
    @Published var running = false
    @Published var preparing = false
    @Published var sample: RunSample?
    @Published var message = "先打开学校网页，登录并进入健身长跑，再返回此页开始。"
    @Published var lastVoice = ""
    @Published var stale = true
    @Published var background = false
    @Published var report: TestReport?
    @Published var nextAt: Date?
    @Published var exportURL: URL?
    let browser = SchoolBrowser()
    private let voice = Voice()
    private let motion = Motion()
    private var task: Task<Void, Never>?
    private var api: SchoolAPI?
    private var generation = UUID()
    private var policy = RunPolicy()
    private var lastQuery: Date?
    private var locationMeters: Double?
    private var locationAt: Date?
    private var steps = 0
    private var cadence: Double?

    init() {
        voice.event = { [weak self] kind, text in self?.report?.log(kind, text) }
        motion.status = { [weak self] text in self?.report?.log("location", text) }
        motion.update = { [weak self] meters in self?.locationMeters = meters; self?.locationAt = Date() }
        motion.steps = { [weak self] steps, cadence in
            guard self?.running == true else { return }
            self?.steps = steps; self?.cadence = cadence
        }
    }
    func start(lab: Bool, period: String, interval: Double, initialMeters: Double, missing: Bool,
               duration: Double, useLocation: Bool, useSteps: Bool) {
        guard !running && !preparing else { return }
        generation = UUID(); let id = generation
        preparing = true; sample = nil; stale = true; policy = RunPolicy(); lastQuery = nil; locationMeters = nil; locationAt = nil; lastVoice = ""
        steps = 0; cadence = nil
        report = TestReport(mode: lab ? "LOCAL_SIMULATION" : "SCHOOL_API", started: Date())
        report?.log("start", lab ? "模拟数据，不代表真实打卡" : "只读查询当前用户运动记录")
        message = "正在准备监测…"
        task = Task { [weak self] in
            guard let self = self else { return }
            do {
                if !lab {
                    let session = try await self.browser.capture(period: period)
                    try Task.checkCancellation()
                    guard self.generation == id else { return }
                    self.api = SchoolAPI(session: session, store: self.browser.webView.configuration.websiteDataStore.httpCookieStore)
                }
                self.preparing = false; self.running = true
                if useLocation && !lab { self.motion.start() }
                if useSteps && !lab { self.motion.startSteps() }
                let start = Date()
                let platform = LabPlatform(start: start, checkpointSeconds: min(600, max(5, interval)),
                                           initialMeters: max(0, initialMeters), missingPoint: missing)
                var unavailableSince: Date?
                while !Task.isCancelled && self.generation == id {
                    if Date().timeIntervalSince(start) >= min(7200, max(30, duration)) {
                        self.stop(reason: "达到本次时长上限，已停止。"); return
                    }
                    let now = Date()
                    if let last = self.lastQuery, now.timeIntervalSince(last) > 45 {
                        self.report?.log("executionGap", "两次查询间隔\(Int(now.timeIntervalSince(last)))秒；可能发生系统暂停或网络等待，不补发积压请求。")
                    }
                    self.lastQuery = now
                    self.report?.queries += 1
                    if self.background { self.report?.backgroundQueries += 1 }
                    let result: RunSample?
                    if lab { result = platform.query(now: now) }
                    else { result = try await self.api?.query() }
                    try Task.checkCancellation()
                    guard self.generation == id else { return }
                    self.report?.successes += 1
                    var delay = 15.0
                    if let value = result {
                        unavailableSince = nil
                        self.sample = value; self.stale = false
                        self.report?.samples.append(value)
                        if (self.report?.samples.count ?? 0) > 1000 { self.report?.samples.removeFirst() }
                        let freshGPS = self.locationAt.map { Date().timeIntervalSince($0) < 20 } ?? false
                        let decision = self.policy.update(value, now: Date(), gpsMeters: freshGPS ? self.locationMeters : nil)
                        delay = decision.interval
                        if decision.stop { self.stop(reason: decision.message ?? "已停止"); return }
                        self.message = lab ? "本地模拟运行中，数据不是学校记录。" : "监测中，学校记录变化时播报。"
                        if let text = decision.message { self.lastVoice = text; self.voice.say((lab ? "模拟测试。" : "") + text) }
                        let cadenceText = self.cadence.map { String(format: "%.1f", $0) } ?? "未知"
                        self.report?.log("query", "成功；下次计划\(Int(delay))秒；定位辅助累计\(Int(self.locationMeters ?? 0))米；步数\(self.steps)；步频\(cadenceText)步/分")
                    } else {
                        self.stale = true
                        if unavailableSince == nil { unavailableSince = Date() }
                        if Date().timeIntervalSince(unavailableSince!) >= 300 {
                            self.stop(reason: "详情持续五分钟不可用，请核对学校页面。"); return
                        }
                        self.message = "规则尚未提供跑步详情，正在等待。"
                        self.report?.log("query", "规则可用，详情暂不可用")
                    }
                    if lab { delay = min(delay, max(1, interval / 3)) }
                    self.nextAt = Date().addingTimeInterval(delay)
                    self.saveReport()
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            } catch is CancellationError { /* Stop owns final state. */ }
            catch {
                guard self.generation == id else { return }
                // Do not serialize URLSession descriptions; they may contain URLs/query identifiers.
                self.stop(reason: (error as? RunError)?.errorDescription ?? "查询或连接失败，已停止。请检查网络与学校会话。")
            }
        }
    }
    func stop(reason: String = "已停止监测。再次开始会创建新报告。") {
        generation = UUID(); task?.cancel(); task = nil; api?.close(); api = nil
        running = false; preparing = false; stale = true; nextAt = nil
        motion.stop(); voice.stop(); message = reason
        report?.ended = Date(); report?.log("stop", reason)
        saveReport()
    }
    func scene(_ phase: ScenePhase) {
        background = phase == .background
        report?.log("lifecycle", phase == .active ? "active" : phase == .background ? "background" : "inactive")
        if phase == .background {
            stale = true; saveReport()
        } else if phase == .active && running {
            message = "已返回前台，等待新查询。后台运行是否连续请查看报告。"
        }
    }
    func replay() { if !lastVoice.isEmpty { voice.say(lastVoice) } }
    func audition() { voice.say("凌跑助手语音测试。请确认能听到这段话。") }
    func saveReport() {
        guard let report = report else { return }
        do {
            let directory = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let name = "LingRun-iOS-\(Int(report.started.timeIntervalSince1970 * 1000)).json"
            let url = directory.appendingPathComponent(name)
            let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601; encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(report).write(to: url, options: [.atomic, .completeFileProtectionUnlessOpen])
            exportURL = url
        } catch { message = "报告保存失败，请检查设备剩余空间。" }
    }
}
