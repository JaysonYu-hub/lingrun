import XCTest
@testable import LingRun

final class LingRunTests: XCTestCase {
    let start = Date(timeIntervalSince1970: 1790400000)
    func testDistanceUnitsAndLaps() {
        let sample = RunSample(runKey: "test", status: "1", distance: "1.2公里", totalTime: "10分", remaining: nil, checkpoints: [])
        XCTAssertEqual(sample.meters, 1200)
        XCTAssertEqual(sample.lapText, "3 圈")
        let bare = RunSample(runKey: "test", status: "1", distance: "1200", totalTime: "10分", remaining: nil, checkpoints: [])
        XCTAssertNil(bare.meters)
    }
    func testPollingDoesNotIncrementDistanceOrRepeatSpeech() {
        let lab = LabPlatform(start: start, checkpointSeconds: 80, initialMeters: 800, missingPoint: false)
        var policy = RunPolicy()
        let baseline = lab.query(now: start)
        XCTAssertEqual(baseline.lapText, "2 圈")
        XCTAssertNotNil(policy.update(baseline, now: start).message)
        for second in 1...20 {
            let sample = lab.query(now: start.addingTimeInterval(Double(second)))
            XCTAssertNil(policy.update(sample, now: start.addingTimeInterval(Double(second))).message)
            XCTAssertEqual(sample.meters, 800)
        }
        let changed = lab.query(now: start.addingTimeInterval(80))
        XCTAssertEqual(changed.lapText, "2.5 圈")
        XCTAssertTrue(policy.update(changed, now: start.addingTimeInterval(80)).message!.contains("打卡已确认"))
    }
    func testAdaptiveAndOptionalGPS() {
        let lab = LabPlatform(start: start, checkpointSeconds: 80, initialMeters: 0, missingPoint: false)
        var policy = RunPolicy()
        _ = policy.update(lab.query(now: start), now: start, gpsMeters: 0)
        let at = start.addingTimeInterval(80), sample = lab.query(now: at)
        XCTAssertEqual(policy.update(sample, now: at, gpsMeters: 200).interval, 20)
        let gps = policy.update(sample, now: at.addingTimeInterval(10), gpsMeters: 355)
        XCTAssertEqual(gps.interval, 5)
        XCTAssertNil(gps.message)
        XCTAssertEqual(policy.update(sample, now: at.addingTimeInterval(60)).interval, 5)
        XCTAssertNotNil(policy.update(sample, now: at.addingTimeInterval(160)).message)
        XCTAssertNil(policy.update(sample, now: at.addingTimeInterval(165)).message)
    }
    func testSessionChangeStops() {
        var policy = RunPolicy()
        let lab = LabPlatform(start: start, checkpointSeconds: 10, initialMeters: 0, missingPoint: false)
        _ = policy.update(lab.query(now: start), now: start)
        let other = RunSample(runKey: "other", status: "1", distance: "0米", totalTime: "0秒", remaining: nil, checkpoints: [])
        XCTAssertTrue(policy.update(other, now: start).stop)
    }
    func testNavigationIsRestricted() {
        XCTAssertTrue(SchoolPolicy.navigation(SchoolPolicy.entry))
        for value in ["https://dlut.edu.cn.evil.test/", "http://webvpn.dlut.edu.cn/", "https://user:secret@webvpn.dlut.edu.cn/", "https://webvpn.dlut.edu.cn:444/"] {
            XCTAssertFalse(SchoolPolicy.navigation(URL(string: value)!))
        }
    }
    @MainActor func testDecoderAndChinaTimezone() throws {
        let sample = try SchoolAPI.decode(rule: ["amId": "test"], body: ["amDel": ["exercise_run_status": "1", "distance": "800米", "time": "5分", "running_countdown_time": 30]], period: "amDel")
        XCTAssertEqual(sample.remaining, 30)
        XCTAssertEqual(sample.lapText, "2 圈")
        XCTAssertThrowsError(try SchoolAPI.decode(rule: [:], body: ["amDel": ["exercise_run_status": "1", "distance": "800米", "time": "5分", "running_countdown_time": true]], period: "amDel"))
        XCTAssertEqual(SchoolAPI.parseDate("2026-09-26 10:00:00"), SchoolAPI.parseDate("2026-09-26T02:00:00Z"))
    }
    func testReportHasNoSessionFields() throws {
        let report = TestReport(mode: "LOCAL_SIMULATION", started: start)
        let json = String(data: try JSONEncoder().encode(report), encoding: .utf8)!
        for key in ["token", "userId", "Cookie", "Authorization", "latitude", "longitude"] {
            XCTAssertFalse(json.contains(key))
        }
    }
}
