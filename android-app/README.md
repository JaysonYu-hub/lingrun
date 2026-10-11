# 凌跑助手 App 源码

当前版本 **0.4.4-beta.1**，包名 `cn.trackcheck.beta`，最低 Android API 26、目标 API 35。

## Windows 构建

准备 Node.js 和 JDK 17，从仓库根目录执行：

```powershell
.\android-app\setup-tools.ps1
.\android-app\build.ps1 -Jdk '你的JDK17路径'
```

本机已使用 Node.js 26.1.0 验证。构建脚本会检查版本一致性、生成网页运行资源，再编译和签名，输出到 `android-app/dist/`。SDK 默认位于 `.tools/`，也可以通过 `build.ps1 -ToolsRoot '已有工具目录'` 指定。

`runtime/` 保存 App 实际使用的网页接口读取、规则判断与内置自检模块，不依赖仓库外的旧测试工程。`app/` 是原生 Java Android 工程。

## 版本与签名

使用 `node android-app/bump-version.cjs <版本名> <递增版本码>` 更新版本；维护者随后同步 CHANGELOG、用户说明及首页下载链接。

签名私钥不在仓库内。首次本地构建会生成新的本地签名，不能覆盖维护者签名的已安装 App。维护者分发更新必须沿用原私钥，且不得上传 `.signing/`。`package-release.ps1` 生成安装包和使用资料，不打包独立测试工程或服务器。

本仓库的编译成功不代表所有手机上的后台、定位或语音均通过；发布前仍需在维护者本地进行回归和真机验收。此轮仅整理仓库，不改变现有 APK 功能。
