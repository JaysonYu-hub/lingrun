# 跑点助手反馈接收服务

这是 0.4.3-beta.1 的配套接收服务源码，尚未部署到公网。需要你自己的服务器、域名和有效 HTTPS 证书。App 不会把反馈直接发送到 Codex 对话；接收后的 JSON 可以再由维护者上传到对话分析。

## 接收什么

用户主动提交的问题文字、App 版本、反馈编号、创建时间，以及用户选择的一份测试报告快照（可不附报告）。不读取学校账号、Cookie 或私有会话，不操作学校网站。报告包含设备、运行事件及模拟/真实模式标记；用户自由填写的文字可能包含个人信息，因此只向授权维护者开放存储目录。

无第三方 npm 依赖。运行 `node server.mjs`，启动前必须设置随机上传码。服务仅监听 `127.0.0.1:8787`，由 HTTPS 反向代理接入；不要把数据目录作为静态网站发布。无公开反馈查询/下载接口，无公开管理后台。

## 在 Linux 服务器部署

1. 安装 Node.js，创建低权限系统用户 `trackcheck`，将本目录源码放在 `/opt/trackcheck-feedback`。用 `node --test server.test.mjs` 验证接收服务。
2. 生成每位测试者独立的提交码：

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. 创建 `/etc/trackcheck-feedback.env`，仅 root 可读（权限 600），填写实际值：

   ```text
   FEEDBACK_UPLOAD_KEYS=测试者A随机码,测试者B随机码
   FEEDBACK_DATA_DIR=/var/lib/trackcheck-feedback
   PORT=8787
   ```

   不要使用示例中文作为码。每个码至少 24 个字符，不含逗号；上传码只有提交权限，没有读取权限。不要放进公开 APK、Git 仓库或群公告。小规模内测按人分发，泄露时删除对应码并重启服务。

4. 创建 `/etc/systemd/system/trackcheck-feedback.service`：

   ```ini
   [Unit]
   Description=Trackcheck feedback receiver
   After=network.target

   [Service]
   User=trackcheck
   Group=trackcheck
   WorkingDirectory=/opt/trackcheck-feedback
   EnvironmentFile=/etc/trackcheck-feedback.env
   ExecStart=/usr/bin/node /opt/trackcheck-feedback/server.mjs
   Restart=on-failure
   StateDirectory=trackcheck-feedback
   UMask=0077
   NoNewPrivileges=true
   PrivateTmp=true
   ProtectSystem=strict
   ProtectHome=true

   [Install]
   WantedBy=multi-user.target
   ```

   按实际 Node 路径修改 `ExecStart`，执行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now trackcheck-feedback`。用 `sudo systemctl status trackcheck-feedback` 确认启动。环境变量缺失时服务会拒绝启动，不会开放匿名上传。

5. 为域名配置有效 HTTPS 证书。将下面 location 加到该域名已有的 Nginx HTTPS server 配置内：

   ```nginx
   location = /v1/feedback {
       client_max_body_size 4m;
       client_body_timeout 30s;
       proxy_connect_timeout 5s;
       proxy_read_timeout 35s;
       proxy_pass http://127.0.0.1:8787;
   }
   ```

   验证 Nginx 配置后重载。App 地址填写 **https://你的实际域名/v1/feedback**，不能只填写域名首页，不能用 HTTP 或自签名证书，不能经过 301/302 登录跳转。服务端不要记录 Authorization 请求头。上传接口不需要浏览器 CORS。

6. 使用内测手机配置实际地址与该测试者的提交码，先进行一次本地模拟，再写“反馈链路测试，请忽略”并提交。App 应显示反馈编号，服务器应出现同编号 `.json` 文件。双方编号及问题文字、模拟标记一致后再分发给其他人。

## 维护者查看反馈

通过 SSH/SFTP 访问 `/var/lib/trackcheck-feedback/<反馈编号>.json`，不要给测试者服务器登录权限。文件结构：

```json
{
  "receivedAt": "接收时间",
  "sha256": "规范化 JSON 内容摘要",
  "feedback": {
    "schema": 1,
    "feedbackId": "UUID",
    "createdAt": "手机创建时间",
    "appVersion": "0.4.3-beta.1",
    "description": "用户的问题描述",
    "report": { "simulated": true }
  }
}
```

`feedback.report` 是完整的诊断快照（敏感字段过滤后），也可能为 null。可将整份反馈 JSON 下载并上传到本对话；不必拆分描述和报告。服务不会上传到其他平台，也不收集 IP 到反馈文件。代理自身日志由部署者管理。

默认每个提交码每分钟最多 20 次，单条最多 4 MB，最多保存 10000 条；达到容量后返回 507，不删除旧反馈。请监控磁盘用量、定期备份并按内测保留周期清理；删除已接收文件后就不再保留其去重依据。当前文件服务适合单实例小规模内测，不要启动多进程或多副本指向同一数据目录；公开大规模发布前应接入账户认证、数据库、配额及管理后台。

## 接口约定与失败排查

POST `/v1/feedback`，`Content-Type: application/json`，`Authorization: Bearer <上传码>`，请求体为上述 `feedback` 对象。成功 201；相同编号及相同 JSON 内容重试（忽略键顺序和空白）返回 200；回执必须是 `{"ok":true,"feedbackId":"原编号"}`。同编号不同内容 409，错误码 401/415/413/429/503/507 分别为认证、类型、大小、频率、写入忙、容量不足。服务器不跟随外部地址、不执行报告内容。

App 收到匹配回执才标记“已收到”。超时有可能是服务器已保存而回执丢失，用原记录重试即可去重。没有收到回执时不应推断服务器未收到。App 不会长期后台自动上传；关闭 App 或系统终止后，待提交记录留在本机，下次手动重试。卸载或清除数据会删除本地记录。

## 发布前验收

- 正确码提交，App 与磁盘编号一致；无报告的登录问题也可提交。
- 错误码提示 401，原记录保留；恢复正确码后同一记录可重试。
- 断网提交失败，恢复网络后从反馈记录重试。
- 停止服务后请求超时/失败，恢复服务再重试。
- 切换接收地址后，旧反馈不能将新服务器提交码发送到旧服务器。
- 检查真实报告不含账号、密码、令牌和精确经纬度；问题文字由用户自行填写，不应填写上述信息。
- APK 在 Android / 鸿蒙 4 上的输入框、回执和进程重启恢复仍需实机验收；本地服务测试不能替代公网 HTTPS 和手机验证。
