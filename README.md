# 凌跑助手

面向 Android 的跑步监测助手，当前为 **0.4.4-beta.1 内测版**，不是学校官方应用。

## 下载与使用

- [版本发布页与 APK 下载](https://github.com/JaysonYu-hub/lingrun/releases/tag/v0.4.4-beta.1)
- [直接下载 APK](https://github.com/JaysonYu-hub/lingrun/releases/download/v0.4.4-beta.1/LingRun-0.4.4-beta.1.apk)
- [首次使用指南](android-app/新手快速开始.md)
- [使用说明](android-app/内测版使用说明.md)
- [更新记录](android-app/CHANGELOG.md)

已有版本请直接覆盖安装，不要先卸载。打开 App，完成学校/VPN 登录，进入学校首页的“健身长跑”，再点“返回监测”。

安装包 SHA-256：`2a56c22fc0652fb7e4e25f78c2b06ac2a4504868d90050fdaff39046dd7f727d`。版本与签名证书信息见 [release.json](downloads/release.json)。

## 主要功能

- 查看学校平台记录的路程、累计用时和下个检查点剩余时间。
- 按平台距离折算圈数，在记录更新时语音提示。
- 支持后台监测，定位与计步辅助可选。
- 支持导出问题报告；在线反馈需要维护者另行配置接收服务。

后台运行效果受手机系统和授权设置影响。只有学校记录能确认打卡，位置与步频只能辅助估算。

## 源码

`android-app/` 为 App 源码与构建脚本，`downloads/` 为当前安装包。构建方法见 [App 开发说明](android-app/README.md)。本仓库当前版本不包含独立 API 调试项目、旧浏览器方案、手机测试工程或反馈服务器源码；App 构建必需的模块位于 `android-app/runtime/`。

本项目公开提供源码与内测安装包。发布到 GitHub 不代表已经覆盖全部手机的真机验收；请先小范围试用。尚未设置自动更新，升级时下载新版 APK 覆盖安装。

一般问题可在 Issues 中描述操作步骤、手机系统和版本号。请勿在公开 Issues 上传含个人信息的原始报告、学校登录凭据或反馈提交码；需要报告时先与维护者确认私下发送方式。

## 平台支持说明

当前版本仅支持 Android，提供 APK 安装包。iOS 适配尚未完成，暂不支持在 iPhone 或 iPad 上安装使用，也未提供对应的安装包。后续如有适配进展，将在本仓库更新说明。
