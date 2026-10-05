# 跑点助手 · rain_tree

面向 Android 与鸿蒙 4 的跑步监测内测 App，当前版本 **0.4.3-beta.1**。不是学校官方应用；鸿蒙原生系统版本的兼容性不在本轮验收范围。

## 下载与首次使用

- [下载 APK：0.4.3-beta.1](downloads/trackcheck-0.4.3-beta.1.apk?raw=true)
- [完整内测包：APK + 手机操作指南](downloads/trackcheck-test-kit-0.4.3-beta.1.zip?raw=true)
- [新手快速开始](android-app/新手快速开始.md)
- [本地模拟测试指南](android-app/原地模拟测试指南.md)
- [更新记录](android-app/CHANGELOG.md)

已有内测版请直接覆盖安装，不要先卸载。首次进入 App 后完成学校/VPN 登录，再点击学校首页“健身长跑”，然后点应用上方“返回监测”开始使用。

安装包 SHA-256：`85cdd6e35e3edf06733d0e4f500db72a3cdd25793ec8679f0f649f9f1afa4e81`。完整版本与签名证书信息见 [release.json](downloads/release.json)。这里提供仓库文件下载，尚未设置 GitHub Releases 自动发布。

## 功能

- 从用户已登录的学校接口只读获取距离、用时、检查点记录，变化时语音提示。
- 跑道按 400 米折算圈数；定位与计步可选，不能替代学校打卡确认。
- 原生后台监测和语音，包含后台设置引导；不同系统的锁屏存活仍需实测。
- 无需实际跑步的本地模拟平台，支持自定义测试间隔。
- 用户填写问题文字，选择测试 JSON 后提交至维护者配置的 HTTPS 服务；失败保留，支持重试和回执。

## 反馈服务：需要单独部署

**上传源码到 GitHub 不代表反馈服务已上线。** GitHub 仓库/Pages 不运行这里的 Node.js 接收进程。目前没有预置的公网反馈地址。

1. 维护者按 [服务器部署说明](feedback-server/README.md) 部署 HTTPS 接收服务。
2. 把接收地址及测试提交码提供给测试者。
3. 测试者在“测试与报告 → 反馈服务器设置”配置，按 [问题反馈指南](android-app/问题反馈使用指南.md) 操作。
4. 维护者通过 SSH/SFTP 读取服务器私有目录中的反馈 JSON。需要进一步分析时，再手动上传到对话。

[反馈服务源码压缩包](downloads/trackcheck-feedback-server-0.4.3-beta.1.zip?raw=true)。不要把实际报告、登录凭据或提交码发到公开 Issues，也不要将服务的数据目录放进 Git 仓库。

## 项目结构与开发

- `android-app/`：Java Android App、构建脚本、原生测试与用户指南。
- `feedback-server/`：Node.js 接收服务及集成测试，无第三方运行依赖。
- `api-test/`、`quark-api/core.cjs`：App 打包使用的共享 JS 逻辑与回归测试，保留部分历史手机测试代码作对照。
- `desktop/`、`phone-test/`：共享解析器回归依赖，不是完整的旧电脑端软件。
- `downloads/`：经过签名的内测安装包和分发资料。

Node.js 回归（不请求学校、不需要账号）：

```sh
npm test
npm run test:feedback
```

Android 构建见 [构建说明](android-app/README.md)。当前 Windows 构建脚本使用 JDK 17、Android SDK 35；本地 Node 验证版本为 26.1.0。第三方工具、签名私钥、用户报告均不包含在仓库中。

## 验证范围

已通过共享逻辑、原生主机回归、反馈接收服务本地测试与 APK 编译/签名验证。公网 HTTPS 提交、各机型反馈表单和长期后台运行需要部署后真机验证。反馈模块不会读取学校会话，也不会自动向 GitHub 或其他平台上传用户报告。
