import SwiftUI
import WebKit

@MainActor final class SchoolBrowser: NSObject, ObservableObject, WKNavigationDelegate {
    let webView: WKWebView
    @Published var status = "登录后请点击学校首页的“健身长跑”，再点右上角“返回监测”。"
    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        if let path = Bundle.main.url(forResource: "school-session", withExtension: "js"),
           let script = try? String(contentsOf: path) {
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
    }
    func openIfNeeded() { if webView.url == nil { webView.load(URLRequest(url: SchoolPolicy.entry)) } }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, SchoolPolicy.navigation(url) else {
            status = "此验证版仅允许学校 HTTPS 页面。外部登录跳转需另行验证。"
            decisionHandler(.cancel); return
        }
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        status = "完成登录并进入健身长跑后，点“返回监测”。网页不会被关闭。"
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        status = "学校网页未加载成功，请检查网络后重试。"
    }
    func capture(period: String) async throws -> SchoolSession {
        guard let url = webView.url, SchoolPolicy.exercise(url), ["amDel", "pmDel"].contains(period) else {
            throw RunError.message("请先在学校网页登录，并进入“健身长跑”，再返回监测。")
        }
        let script = "window.__exerciseApiTest ? window.__exerciseApiTest.takeNativeSession('\(period)') : null"
        let result = try await webView.evaluateJavaScript(script)
        guard let value = result as? [String: Any], value["ok"] as? Bool == true,
              let privateSession = value["privateSession"] as? [String: Any] else {
            throw RunError.message("网页已打开，但尚未识别可用接口会话。请返回学校首页，再进入健身长跑。")
        }
        return try SchoolSession(privateSession)
    }
}

struct SchoolWebView: UIViewRepresentable {
    let browser: SchoolBrowser
    func makeUIView(context: Context) -> WKWebView { browser.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct LoginScreen: View {
    @ObservedObject var browser: SchoolBrowser
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text(browser.status).font(.footnote).padding().background(Color.teal.opacity(0.1))
                SchoolWebView(browser: browser)
            }
            .navigationTitle("学校网页")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("学校首页") { browser.webView.load(URLRequest(url: SchoolPolicy.entry)) }
                }
                ToolbarItem(placement: .navigationBarTrailing) { Button("返回监测") { dismiss() } }
            }
        }
    }
}
