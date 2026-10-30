import Foundation
import CoreFoundation
import CryptoKit
import WebKit

enum RunError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

enum SchoolPolicy {
    static let entry = URL(string: "https://webvpn.dlut.edu.cn/http-8081/57787a7876706e323032336b657940242a485056ad52cb00fc19b469c2e3/mobilenew/#/index")!
    static func navigation(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, let host = url.host else { return false }
        return host == "dlut.edu.cn" || host.hasSuffix(".dlut.edu.cn")
    }
    static func endpoint(_ url: URL, name: String) -> Bool {
        navigation(url) && url.host == "webvpn.dlut.edu.cn" &&
        url.path.hasSuffix("/mobile/extExercise/\(name)") && url.fragment == nil
    }
    static func exercise(_ url: URL) -> Bool {
        url.host == "webvpn.dlut.edu.cn" && navigation(url) && url.path.contains("/mobilenew/") &&
        (url.fragment == "/extExercise" || (url.fragment ?? "").hasPrefix("/extExercise?"))
    }
}

/// Session is in-memory only, never Codable and never part of an exported report.
struct SchoolSession {
    let rule: URL
    let detail: URL
    let token: String
    let user: String
    let period: String
    let referer: String
    let userAgent: String
    init(_ value: [String: Any]) throws {
        guard let rule = (value["ruleUrl"] as? String).flatMap(URL.init(string:)),
              let detail = (value["detailUrl"] as? String).flatMap(URL.init(string:)),
              SchoolPolicy.endpoint(rule, name: "findExeRule"), SchoolPolicy.endpoint(detail, name: "findExtExercise"),
              let token = value["token"] as? String, !token.isEmpty,
              let user = value["userId"] as? String, !user.isEmpty,
              let period = value["period"] as? String, ["amDel", "pmDel"].contains(period) else {
            throw RunError.message("未取得有效的学校会话，请进入健身长跑后重试。")
        }
        self.rule = rule; self.detail = detail; self.token = token; self.user = user; self.period = period
        referer = (value["referer"] as? String ?? "").components(separatedBy: "#")[0]
        userAgent = value["userAgent"] as? String ?? ""
    }
}

final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Never forward school authorization to a login redirect.
    }
}

@MainActor final class SchoolAPI {
    private let session: SchoolSession
    private let store: WKHTTPCookieStore
    private let http: URLSession
    init(session: SchoolSession, store: WKHTTPCookieStore) {
        self.session = session; self.store = store
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 25
        config.httpCookieStorage = nil
        config.urlCache = nil
        http = URLSession(configuration: config, delegate: NoRedirect(), delegateQueue: nil)
    }
    func close() { http.invalidateAndCancel() }
    static func hash(_ text: String) -> String {
        Insecure.SHA1.hash(data: Data(text.utf8)).map { String(format: "%02X", $0) }.joined()
    }
    static func signed(_ fields: [String: Any]) -> [String: Any] {
        var result = fields
        let input = fields.keys.sorted().compactMap { key -> String? in
            guard let value = fields[key] as? String, !value.isEmpty else { return nil }
            return "\(key)=\(value)"
        }.joined(separator: "&")
        result["sign"] = hash((input.isEmpty ? "" : input + "&") + "key=8d6c5b73a50d4707bd71c93882ddbc8b")
        return result
    }
    private func post(_ url: URL, fields: [String: Any]) async throws -> [String: Any] {
        try Task.checkCancellation()
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
        let selected = cookies.filter { cookie in
            let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
            let host = url.host ?? ""
            let path = url.path
            let matchesPath = path == cookie.path || (path.hasPrefix(cookie.path) &&
                (cookie.path.hasSuffix("/") || path.dropFirst(cookie.path.count).hasPrefix("/")))
            return (host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))) &&
                matchesPath && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: Self.signed(fields))
        request.setValue("application/json;charset=UTF-8", forHTTPHeaderField: "Content-Type")
        request.setValue(session.token, forHTTPHeaderField: "Authorization")
        request.setValue("https://webvpn.dlut.edu.cn", forHTTPHeaderField: "Origin")
        request.setValue(session.referer, forHTTPHeaderField: "Referer")
        request.setValue(session.userAgent, forHTTPHeaderField: "User-Agent")
        for (key, value) in HTTPCookie.requestHeaderFields(with: selected) { request.setValue(value, forHTTPHeaderField: key) }
        let (data, response) = try await http.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw RunError.message("无有效 HTTP 响应。") }
        guard response.statusCode == 200 else { throw RunError.message("接口 HTTP \(response.statusCode)，已停止查询。") }
        guard !["TIMEOUT", "NOFUN"].contains(response.value(forHTTPHeaderField: "abnormal") ?? "") else {
            throw RunError.message("学校会话已失效，请重新登录。")
        }
        guard data.count <= 1_048_576, let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              body["status"] as? String == "PASS" else { throw RunError.message("接口未返回有效业务数据。") }
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { $0[String(describing: $1.key)] = String(describing: $1.value) }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: url) {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                store.setCookie(cookie) { continuation.resume() }
            }
        }
        return body
    }
    func query() async throws -> RunSample? {
        var fields: [String: Any] = ["userId": session.user]
        let rule = try await post(session.rule, fields: fields)
        if Self.text(rule["isRun"]) == "0" { return nil }
        guard rule["isRun"] != nil else { throw RunError.message("规则缺少必要字段。") }
        fields["amId"] = Self.text(rule["amId"]).map { $0 as Any } ?? NSNull()
        fields["pmId"] = Self.text(rule["pmId"]).map { $0 as Any } ?? NSNull()
        let body = try await post(session.detail, fields: fields)
        return try Self.decode(rule: rule, body: body, period: session.period)
    }
    static func text(_ value: Any?) -> String? {
        if let string = value as? String { return string }
        if let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() { return number.stringValue }
        return nil
    }
    static func decode(rule: [String: Any], body: [String: Any], period: String) throws -> RunSample {
        guard let raw = body[period] as? [String: Any], let status = text(raw["exercise_run_status"]) else {
            throw RunError.message("详情缺少跑步状态。")
        }
        let distance = text(raw["distance"]) ?? "无", total = text(raw["time"]) ?? "无"
        if status == "1" && (distance == "无" || total == "无" || distance.isEmpty || total.isEmpty) {
            throw RunError.message("跑步详情字段不完整。")
        }
        var remaining: Int?
        if status == "1", let value = raw["running_countdown_time"], !(value is NSNull), text(value) != "" {
            guard let string = text(value), let number = Double(string), number.isFinite,
                  number >= 0, number <= Double(Int32.max), number.rounded(.down) == number else {
                throw RunError.message("倒计时格式异常。")
            }
            remaining = Int(number)
        }
        let points = (raw["tag_path"] as? [[String: Any]] ?? []).suffix(256).compactMap { row -> Checkpoint? in
            guard let reader = text(row["reader_id"]), let time = text(row["date_time"]) else { return nil }
            return Checkpoint(id: hash(reader + "|" + time), station: hash(reader), time: parseDate(time))
        }
        return RunSample(runKey: hash(period + "|" + (text(rule[period == "amDel" ? "amId" : "pmId"]) ?? "")),
                         status: status, distance: distance, totalTime: total, remaining: remaining, checkpoints: points)
    }
    static func parseDate(_ text: String) -> Date? {
        let iso = ISO8601DateFormatter()
        if let value = iso.date(from: text.replacingOccurrences(of: " ", with: "T")) { return value }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai"); formatter.isLenient = false
        for pattern in ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss.SSS"] {
            formatter.dateFormat = pattern
            if let value = formatter.date(from: text) { return value }
        }
        return nil
    }
}
