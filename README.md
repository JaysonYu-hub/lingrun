# 凌跑助手

跑步监测助手，目前提供 **Android 0.4.7-beta.1 测试安装包**和 **iOS 0.1.0 开发预览源码**，不是学校官方应用。两端开发进度不同。

## 下载与安装

| 设备 | 下载入口 | 当前状态 |
|---|---|---|
| Android／支持 Android 应用的鸿蒙系统 | [下载 APK](https://github.com/JaysonYu-hub/lingrun/releases/download/v0.4.7-beta.1/LingRun-0.4.7-beta.1.apk) | 可覆盖安装的测试版 |
| iPhone／iPad | [iOS 开发预览](https://github.com/JaysonYu-hub/lingrun/releases/tag/ios-v0.1.0-preview.1) | 仅源码 ZIP，暂无可直接安装的 IPA、TestFlight 或 App Store 版本 |

### Android 安装与使用

- [版本发布页与 APK 下载](https://github.com/JaysonYu-hub/lingrun/releases/tag/v0.4.7-beta.1)
- [直接下载 APK](https://github.com/JaysonYu-hub/lingrun/releases/download/v0.4.7-beta.1/LingRun-0.4.7-beta.1.apk)
- [首次使用指南](android-app/新手快速开始.md)
- [使用说明](android-app/内测版使用说明.md)
- [更新记录](android-app/CHANGELOG.md)

已有版本请直接覆盖安装，不要先卸载。打开 App，完成学校/VPN 登录，进入学校首页的“健身长跑”，再点“返回监测”。

安装包 SHA-256：`b18af8ab8f8440cc4d954c679475b7c27ec26e6025a3a6f601543aa81e9a1f79`。版本与签名证书信息见 [release.json](downloads/release.json)。

本版支持在监测页选择 **100米间距四点 / 200米间距两点**，均按400米一圈计算；布局会保存在本机。首次试听确认后不再重复启动试听。维护者反馈本轮测试未发现问题，其他设备仍需验证。

### iOS 开发者构建与安装验证

iOS 工程已公开，最低部署目标为 iOS 16。目前尚未完成 Xcode 编译、原生测试、签名与真机验收，也尚未与 Android 的双布局等最新功能完全对齐。源码 ZIP 不是手机安装包。

具备 Mac 和 Xcode 的开发者可按 [iOS 构建说明](ios-app/RELEASE_STATUS.md) 生成工程，配置自己的签名 Team，先修复可能出现的编译问题、运行模拟器测试，再在自己的 iPhone 上验证安装与运行。实际声音、锁屏、后台查询和传感器效果需要真机确认。

项目目前未配置 Apple Developer Program 与 TestFlight 分发。可供普通用户安装的渠道准备好后，会在 Releases 和此页面更新。

## Android 当前主要功能

- 查看学校平台记录的路程、累计用时和下个检查点剩余时间。
- 按平台距离折算圈数，在记录更新时语音提示。
- 支持后台监测，开始监测时自动启用已授权的定位与计步辅助；拒绝权限仍可使用基础监测。
- 支持语音试听、0.5～2.0 倍语速设置和问题报告导出。用户端不显示开发测试入口。

后台运行效果受手机系统和授权设置影响。只有学校记录能确认打卡，位置与步频只能辅助估算。

## 源码

`android-app/` 为 Android 源码与构建脚本，`ios-app/` 为 iOS 开发预览工程，`downloads/` 为当前安装包。构建方法见 [App 开发说明](android-app/README.md)。本仓库当前版本不包含独立 API 调试项目、旧浏览器方案、手机测试工程或反馈服务器源码；App 构建必需的模块位于 `android-app/runtime/`。

本项目公开提供源码与内测安装包。发布到 GitHub 不代表已经覆盖全部手机的真机验收；请先小范围试用。尚未设置自动更新，升级时下载新版 APK 覆盖安装。

一般问题可在 Issues 中描述操作步骤、手机系统和版本号。请勿在公开 Issues 上传含个人信息的原始报告、学校登录凭据或反馈提交码；需要报告时先与维护者确认私下发送方式。

## 欢迎参与贡献

欢迎提交 Issue 和 Pull Request（PR），尤其欢迎协助 iOS 的 Xcode 编译验证、原生测试、100米/200米布局同步，以及 iPhone 后台与语音行为测试。Android 的兼容性修复、测试与使用文档改进也欢迎参与。

1. Fork 仓库，创建功能或修复分支。
2. 尽量让一个 PR 聚焦一项改动，附复现步骤或修改目的。
3. 说明测试环境、执行的检查、实际结果及尚未验证的部分；涉及界面可附截图。
4. 向本仓库提交 PR，等待讨论和审阅。

请勿提交学校账号、密码、Cookie、Token、Apple 签名证书或含个人信息的原始报告。提交 PR 不代表自动合并或发布；未经验证的功能应明确标注开发状态。
