# 凌跑助手 Android App

版本 **0.4.4-beta.1**，包名 `cn.trackcheck.beta`，最低 API 26，目标 API 35。面向 Android 与鸿蒙 4 内测，不依赖 AutoJs6 或无障碍。

安装包及操作入口见 [项目首页](../README.md)。本版本保留本地模拟与 JSON 导出，新增可配置的反馈接收服务；服务器需要独立部署。

## 构建（Windows）

准备 Node.js 与 JDK 17，从仓库根目录执行：

```powershell
.\android-app\setup-tools.ps1
.\android-app\verify.ps1 -Jdk '你的JDK17路径'
.\android-app\build.ps1 -Jdk '你的JDK17路径'
```

SDK 下载及主机测试库校验由 `setup-tools.ps1` 完成。构建输出位于 `android-app/dist/`。部分 Java 调用点测试使用环境变量 `TRACKCHECK_TEST_JDK` 指定 JDK，运行验证脚本时统一设置为传入的 JDK。

签名私钥没有发布到仓库。首次本地构建会在被 Git 忽略的 `.signing/` 生成新签名，该包不能覆盖维护者签名的已安装版本。维护者发布更新必须使用原有私钥；不要将私钥或密码提交到 GitHub。`package-release.ps1` 会校验已有发行元数据的签名，生成安装包与用户资料包。

运行 `node android-app/bump-version.cjs <版本名> <递增版本码>` 更新版本后，维护者需同步更新 CHANGELOG、操作文档、首页下载链接和 downloads 中的发行文件。

## 架构和验证边界

Activity 负责学校 WebView 登录，RunService 独立执行 HTTP 查询、计时、语音和可选传感器辅助。私有学校会话仅供运行使用，不进入反馈数据。查询只用观察到的规则和详情端点，不写学校运动记录。

原生主机测试不等于真实 Android 生命周期、锁屏或语音测试。使用 [本地模拟](原地模拟测试指南.md)、[后台检查](后台测试操作说明.md) 验证手机行为；反馈入口说明见 [问题反馈使用指南](问题反馈使用指南.md)。
