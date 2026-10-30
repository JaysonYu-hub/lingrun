import AVFoundation
import CoreLocation
import CoreMotion
import Foundation

@MainActor final class Voice: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    var event: ((String, String) -> Void)?
    override init() { super.init(); synth.delegate = self }
    func say(_ text: String) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
            if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
            guard utterance.voice != nil else { throw RunError.message("中文语音不可用") }
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            synth.speak(utterance)
            event?("speechQueued", text)
        } catch {
            event?("speechError", "语音启动失败，请检查声音设置或返回前台重试。")
            releaseAudio()
        }
    }
    func stop() { synth.stopSpeaking(at: .immediate); releaseAudio() }
    private func releaseAudio() { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        event?("speechStarted", utterance.speechString)
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        event?("speechFinished", utterance.speechString); releaseAudio()
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        event?("speechCancelled", "语音已取消")
    }
}

@MainActor final class Motion: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let pedometer = CMPedometer()
    private var stepGeneration = UUID()
    private var previous: CLLocation?
    private var requested = false
    private(set) var meters: Double = 0
    var update: ((Double) -> Void)?
    var status: ((String) -> Void)?
    var steps: ((Int, Double?) -> Void)?
    override init() { super.init(); manager.delegate = self }
    func start() {
        requested = true; previous = nil; meters = 0
        manager.activityType = .fitness
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
        manager.showsBackgroundLocationIndicator = true
        manager.pausesLocationUpdatesAutomatically = true
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        else { beginIfAllowed() }
    }
    func startSteps() {
        stepGeneration = UUID(); let generation = stepGeneration
        guard CMPedometer.isStepCountingAvailable() else { status?("此设备不支持计步，基础查询不受影响。"); return }
        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            Task { @MainActor in
                guard let self = self else { return }
                guard self.stepGeneration == generation else { return }
                if error != nil { self.status?("计步不可用或未授权，基础查询不受影响。"); return }
                if let data = data { self.steps?(data.numberOfSteps.intValue, data.currentCadence.map { $0.doubleValue * 60 }) }
            }
        }
    }
    private func beginIfAllowed() {
        guard requested else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.allowsBackgroundLocationUpdates = true
            manager.startUpdatingLocation(); status?("定位辅助已启用；后台持续性仍需真机验证。")
        case .denied, .restricted:
            status?("定位未授权，继续按打卡间隔估算；不保证后台持续查询。")
        default: break
        }
    }
    func stop() { requested = false; manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false; previous = nil; stepGeneration = UUID(); pedometer.stopUpdates() }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { beginIfAllowed() }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard requested else { return }
        for location in locations {
            guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 30,
                  abs(location.timestamp.timeIntervalSinceNow) < 20 else { continue }
            if let prior = previous {
                let seconds = location.timestamp.timeIntervalSince(prior.timestamp)
                guard seconds > 0 else { continue }
                let distance = location.distance(from: prior)
                if distance / seconds <= 10, distance >= 3 { meters += distance }
            }
            previous = location
        }
        update?(meters) // Never treated as school checkpoint evidence or exported as coordinates.
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { status?("定位暂不可用，继续按打卡间隔估算。") }
}
