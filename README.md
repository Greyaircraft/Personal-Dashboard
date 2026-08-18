# 个人仪表盘 (Personal Dashboard)

📊 个人数据仪表盘：GitHub 项目数据 + PR 状态 + 服务器监控。

**在线演示**: http://47.95.229.49:8080/dashboard/ (需密码)

## 功能

- 🚀 **GitHub 项目数据**: Star / Fork / 14 天浏览与独立访客 / 14 天 Clone / 近 7 天浏览趋势
- 🔄 **PR 状态**: 合并 / Open / 评论数 / 合并时间
- 🖥️ **服务器监控**: 内存 / 磁盘 / 负载 / 运行时长 / CPU 核数
- 🌗 **深浅色模式**: 跟随系统 + 手动切换 (localStorage 记忆)
- ⏱️ 页面每 60 秒自动刷新

## 技术栈

- **零依赖 Node.js** (仅内置模块 `http`/`fs`/`os`), 无 npm install
- GitHub REST API (traffic 数据需 owner token)
- systemd 服务托管, Caddy 反代 + basic_auth 保护
- 前端原生 JS + CSS 变量 (无框架)

## 部署

```bash
# 1. 部署文件
mkdir -p /opt/dashboard
cp server.js index.html /opt/dashboard/

# 2. systemd 服务
cat > /etc/systemd/system/dashboard.service << 'EOF'
[Unit]
Description=Personal Dashboard
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/dashboard/server.js
Restart=always
Environment=PORT=18792
Environment=GH_TOKEN=your_github_token

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now dashboard

# 3. Caddy 反代 (挂到已有站点 /dashboard/ 路径)
# :8080 {
#     basic_auth { ... }
#     handle /dashboard/* {
#         uri strip_prefix /dashboard
#         reverse_proxy 127.0.0.1:18792
#     }
#     handle { reverse_proxy 127.0.0.1:18789 }
# }
```

## 配置

编辑 `server.js` 顶部的 `PROJECTS` 和 `PRS` 数组即可增删监控对象。

环境变量:

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 (仅 127.0.0.1) | 18792 |
| `GH_TOKEN` | GitHub token (读 traffic 必需) | 空 |
| `CACHE_MS` | GitHub 数据缓存毫秒数 | 600000 |

## 注意

- 修改 `index.html` 后必须重启服务 (`systemctl restart dashboard`), Node 启动时读文件进内存
- GitHub traffic 数据约 24 小时延迟, 且需要仓库 owner 的 token

## License

MIT
