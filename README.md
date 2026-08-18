# 📊 个人仪表盘 / Personal Dashboard

> **中文** | [English](#english)

个人数据仪表盘：GitHub 项目数据 + PR 状态 + 服务器监控，零依赖 Node.js 单文件服务。

A personal dashboard for GitHub project stats + PR status + server monitoring, built with zero-dependency Node.js.

**在线演示 / Live demo**: <http://47.95.229.49:8080/dashboard/>

---

## 功能 / Features

| 中文 | English |
|---|---|
| 🚀 GitHub 项目数据：Star / Fork / 14 天浏览与访客 / Clone / 浏览趋势 | GitHub project stats: stars / forks / 14-day views & visitors / clones / view trend |
| 🔄 PR 状态：合并 / Open / 评论数 / 合并时间 | PR status: merged / open / comments / merge time |
| 🖥️ 服务器监控：内存 / 磁盘 / 负载 / 运行时长 | Server monitoring: memory / disk / load / uptime |
| 📌 可选择监控项目（前端切换，localStorage 记忆） | Selectable monitored projects (switch in UI, saved to localStorage) |
| 🌗 深浅色模式：跟随系统 + 手动切换 | Dark/light mode: follows system + manual toggle |
| 🌐 中英双语界面 | Bilingual UI (中文 / English) |
| ⏱️ 每 60 秒自动刷新 | Auto-refresh every 60s |

---

## 技术栈 / Tech Stack

- **零依赖 Node.js** — 仅内置模块 `http` / `fs` / `os` / `child_process`，无需 `npm install`
- **GitHub REST API** — 仓库元数据 + traffic（浏览/克隆），traffic 需要 owner token
- **systemd** 服务托管，**Caddy** 反向代理
- 前端原生 JS + CSS 变量（无框架）

---

## 部署 / Deploy

```bash
# 1. 部署文件 / Deploy files
mkdir -p /opt/dashboard
cp server.js index.html /opt/dashboard/

# 2. systemd 服务 / systemd service
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

# 3. Caddy 反代（挂到已有站点 /dashboard/ 路径）/ reverse proxy
# :8080 {
#     handle /dashboard/* {
#         uri strip_prefix /dashboard
#         reverse_proxy 127.0.0.1:18792
#     }
#     handle { reverse_proxy 127.0.0.1:18789 }
# }
```

---

## 配置 / Configuration

### 监控对象 / Monitored items

编辑 `server.js` 顶部的 `ALL_PROJECTS` 和 `PRS` 数组即可增删监控对象，也可以直接在页面右上角点击选择要显示的项目（选择会存入浏览器 localStorage）。

Edit the `ALL_PROJECTS` and `PRS` arrays at the top of `server.js` to add/remove monitored items. You can also click the chips in the UI to pick which projects to display (saved to localStorage).

### 环境变量 / Environment variables

| 变量 / Var | 说明 / Description | 默认 / Default |
|---|---|---|
| `PORT` | 监听端口（仅 127.0.0.1）/ listen port (127.0.0.1 only) | 18792 |
| `GH_TOKEN` | GitHub token（读 traffic 必需）/ required for traffic API | 空 / empty |
| `CACHE_MS` | GitHub 数据缓存毫秒 / GitHub data cache ms | 600000 |

### API

| 端点 / Endpoint | 说明 / Description |
|---|---|
| `/` | 仪表盘页面 / dashboard page |
| `/api/data?projects=key1,key2` | 数据（可按项目 key 过滤）/ data (filterable by project key) |
| `/api/projects` | 可选项目列表 / list of selectable projects |

---

## 注意 / Notes

- 修改 `index.html` 后必须重启服务：`systemctl restart dashboard`（Node 启动时读文件进内存，不热更新）
  Restart the service after editing `index.html` — Node reads the file into memory at startup (no hot reload).
- GitHub traffic 数据约 24 小时延迟，且需要仓库 owner 的 token。
  GitHub traffic data has ~24h delay and requires an owner token.
- 页面 API 使用相对路径，兼容部署在子路径（如 `/dashboard/`）下。
  The page uses relative API paths, compatible with sub-path deployment (e.g. `/dashboard/`).

---

## License

MIT
