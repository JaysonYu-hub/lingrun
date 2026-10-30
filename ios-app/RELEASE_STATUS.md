# iOS 0.1.0 开发预览

发布标识：ios-v0.1.0-preview.1。交付物是开发源码 ZIP，不是 IPA，不能直接安装到 iPhone/iPad。Xcode 工程配置的版本为0.1.0，构建号1，最低部署目标iOS16.0。

## 与 Android 的区别

Android当前公开安装包为0.4.7-beta.1，支持100米四点/200米两点；iOS仍是较早的独立SwiftUI工程，未对齐双布局及近期Android改动。代码包含网页登录、查询、语音、可选定位/计步、模拟和报告功能，但这些iOS原生功能尚未通过编译和真机验收，不能称为已可用。

## 验证状态

在Windows执行资源生成与本地JavaScript检查：8组通过（包含11项现有会话隔离检查）。未执行Xcode/Swift编译、XCTest、代码签名、真实学校登录、iPhone后台/锁屏与语音测试。模拟和本地检查不会请求学校或写入学校运动数据。

## Mac 构建入口

压缩包保留ios-app与android-app/runtime的相对目录。需准备Mac、Xcode、Node.js与XcodeGen。仓库目录内执行：

```sh
node ios-app/scripts/prepare-resources.cjs
node ios-app/scripts/check-local.cjs
cd ios-app
xcodegen generate
open LingRun.xcodeproj
```

在Xcode中选择自己的签名Team，先用模拟器运行LingRunTests，再按iPhone测试指南进行真机验收。首次构建可能需要修复未发现的Swift编译问题；本预览不提供编译成功保证。不要将签名证书、账号、Cookie、Token或原始个人报告公开提交。

正式仓库首页README的iOS文字仍待维护者审阅，本次不修改。此文件为当前iOS预览交付状态的说明。
