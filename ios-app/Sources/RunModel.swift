import Foundation

struct Checkpoint: Codable, Equatable {
    let id: String
    let station: String
    let time: Date?
}

struct RunSample: Codable, Equatable {
    let runKey: String
    let status: String
    let distance: String
    let totalTime: String
    let remaining: Int?
    let checkpoints: [Checkpoint]

    var meters: Double? {
        let text = distance.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for suffix in ["公里", "千米", "km", "米", "m"] where text.hasSuffix(suffix) {
            guard let value = Double(text.dropLast(suffix.count).trimmingCharacters(in: .whitespaces)),
                  value.isFinite, value >= 0 else { return nil }
            return value * (["公里", "千米", "km"].contains(suffix) ? 1000 : 1)
        }
        return nil // No guessing units from a bare number.
    }
    var lapText: String { meters.map { String(format: "%g 圈", $0 / 400) } ?? "—" }
}

struct Decision {
    var interval: Double = 5
    var message: String?
    var stop = false
}

/// Checkpoint evidence confirms cards. Distance alone controls presentation, never card confirmation.
struct RunPolicy {
    private var previous: RunSample?
    private var seen = Set<String>()
    private var anchor: Checkpoint?
    private var estimate: Double?
    private var warned = false
    private var anchorMeters: Double?

    mutating func update(_ sample: RunSample, now: Date, gpsMeters: Double? = nil) -> Decision {
        if let old = previous, old.runKey != sample.runKey {
            return Decision(message: "跑步记录已切换，请停止后重新开始。", stop: true)
        }
        let first = previous == nil
        let fresh = sample.checkpoints.filter { !seen.contains($0.id) }
        var result = Decision()
        if !first, fresh.count > 1, fresh.contains(where: { $0.time == nil }) {
            return Decision(message: "打卡顺序无法确认，请核对学校记录。", stop: true)
        }
        let ordered = fresh.sorted { ($0.time ?? .distantPast) < ($1.time ?? .distantPast) }
        for point in ordered {
            if let last = anchor, last.station != point.station,
               let before = last.time, let after = point.time {
                let gap = after.timeIntervalSince(before)
                if gap >= 15 && gap <= 600 { estimate = estimate.map { 0.6 * $0 + 0.4 * gap } ?? gap }
            }
            anchor = point
            seen.insert(point.id)
            warned = false
            anchorMeters = gpsMeters
        }
        let distanceChanged = previous?.distance != sample.distance
        let statusChanged = previous?.status != sample.status
        let meters = sample.meters.map { String(format: "%g米，折合%g圈", $0, $0 / 400) } ?? "距离暂不可用"
        if first {
            result.message = "已开始监测，当前\(meters)。" + (sample.status == "1" ? "" : "等待起跑。")
        } else if !fresh.isEmpty {
            result.message = "学校记录已更新，打卡已确认，累计\(meters)，总用时\(sample.totalTime)。"
        } else if distanceChanged || statusChanged {
            result.message = "学校数据更新，累计\(meters)，总用时\(sample.totalTime)。"
        }
        if sample.status == "1", let at = anchor?.time, let estimate = estimate {
            let elapsed = now.timeIntervalSince(at)
            result.interval = elapsed >= 0 && elapsed < estimate * 0.7 ? 20 : 5
            if elapsed > estimate * 1.6 + 20 && !warned {
                if result.message == nil {
                    result.message = "超过预计到点时间，尚未收到新打卡记录。可能是上传延迟，请核对后再决定是否返回补扫。"
                    warned = true
                }
            }
        }
        // A fresh approximate 150 m since a server point can only increase polling frequency.
        if let origin = anchorMeters, let current = gpsMeters, current - origin >= 150 {
            result.interval = 5
        }
        previous = sample
        return result
    }
}

struct ReportEvent: Codable {
    let at: Date
    let kind: String
    let message: String
}

struct TestReport: Codable {
    let version = "ios-0.1.0-local"
    let mode: String
    let started: Date
    var ended: Date?
    var queries = 0
    var successes = 0
    var backgroundQueries = 0
    var events: [ReportEvent] = []
    var samples: [RunSample] = []
    mutating func log(_ kind: String, _ message: String) {
        events.append(ReportEvent(at: Date(), kind: kind, message: message))
        if events.count > 2000 { events.removeFirst(events.count - 2000) }
    }
}

struct LabPlatform {
    let start: Date
    let checkpointSeconds: Double
    let initialMeters: Double
    let missingPoint: Bool
    func query(now: Date) -> RunSample {
        let seconds = max(0, now.timeIntervalSince(start))
        let point = Int(seconds / max(5, checkpointSeconds))
        let accepted = (0...point).filter { !(missingPoint && $0 == 2) }
        let cards = accepted.suffix(256).map { index in
            Checkpoint(id: "lab-\(index)", station: index % 2 == 0 ? "A" : "B",
                       time: start.addingTimeInterval(Double(index) * checkpointSeconds))
        }
        // Simulated server distance; the client must not derive laps from polling count.
        let distance = initialMeters + Double(accepted.last ?? 0) * 200
        return RunSample(runKey: "LOCAL_SIMULATION", status: "1", distance: "\(distance)米",
                         totalTime: "\(Int(seconds))秒", remaining: max(0, Int(checkpointSeconds - seconds.truncatingRemainder(dividingBy: checkpointSeconds))),
                         checkpoints: Array(cards))
    }
}
