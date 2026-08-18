#!/usr/bin/env node
/**
 * 个人仪表盘 - 零依赖 Node 服务
 * 端口: 18792 (仅 127.0.0.1), 由 Caddy 反代到 /dashboard/
 *
 * 功能:
 *  - GitHub 仓库状态 (star/fork/watch/浏览/clone) + PR 状态
 *  - 服务器监控 (内存/磁盘/负载/uptime)
 *
 * 环境变量:
 *  GH_TOKEN   GitHub classic token (读取 traffic 必需)
 *  PORT       监听端口 (默认 18792)
 *  CACHE_MS   GitHub 数据缓存时间 (默认 10 分钟)
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = parseInt(process.env.PORT || '18792', 10);
const CACHE_MS = parseInt(process.env.CACHE_MS || '600000', 10);
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_API = 'https://api.github.com';

// ---------- 配置: 要监控的项目和 PR ----------
const PROJECTS = [
  {
    repo: 'Greyaircraft/PowerToysRun-PoetSearch',
    name: 'PoetSearch 插件',
    desc: 'PowerToys Run 古诗词搜索 · 78,581 首',
    url: 'https://github.com/Greyaircraft/PowerToysRun-PoetSearch',
    icon: '📜'
  },
  {
    repo: 'Greyaircraft/QuickAi-Plus',
    name: 'QuickAi-Plus',
    desc: 'QuickAI 插件改造版 · LaTeX + Markdown 渲染 + 多 AI 预设',
    url: 'https://github.com/Greyaircraft/QuickAi-Plus',
    icon: '⚡'
  }
];

const PRS = [
  {
    repo: 'microsoft/PowerToys',
    num: 49946,
    name: 'PoetSearch 收录进官方列表',
    url: 'https://github.com/microsoft/PowerToys/pull/49946'
  },
  {
    repo: 'ruslanlap/PowerToysRun-QuickAi',
    num: 31,
    name: 'QuickAI 多 AI 预设',
    url: 'https://github.com/ruslanlap/PowerToysRun-QuickAi/pull/31'
  },
  {
    repo: 'ruslanlap/PowerToysRun-QuickAi',
    num: 26,
    name: 'QuickAI LaTeX + Markdown 渲染',
    url: 'https://github.com/ruslanlap/PowerToysRun-QuickAi/pull/26'
  }
];

// ---------- GitHub API 封装 ----------
let ghCache = null;
let ghCacheAt = 0;

function ghFetch(pathname) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'personal-dashboard'
  };
  if (GH_TOKEN) headers['Authorization'] = 'token ' + GH_TOKEN;
  return fetch(GH_API + pathname, { headers, signal: AbortSignal.timeout(15000) })
    .then(async r => {
      if (!r.ok) throw new Error(pathname + ' -> ' + r.status);
      return r.json();
    });
}

async function fetchRepo(repo) {
  const [meta, views, clones] = await Promise.all([
    ghFetch('/repos/' + repo),
    ghFetch('/repos/' + repo + '/traffic/views'),
    ghFetch('/repos/' + repo + '/traffic/clones')
  ]);
  return {
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    watchers: meta.subscribers_count,
    openIssues: meta.open_issues_count,
    views14d: views.count,
    viewsUniques: views.uniques,
    clones14d: clones.count,
    clonesUniques: clones.uniques,
    viewsDaily: (views.views || []).slice(-7).map(v => ({ day: v.timestamp.slice(0, 10), count: v.count }))
  };
}

async function fetchPR(pr) {
  const d = await ghFetch('/repos/' + pr.repo + '/pulls/' + pr.num);
  return {
    state: d.state,
    merged: d.merged,
    mergedAt: d.merged_at,
    comments: d.comments,
    reviews: d.review_comments,
    title: d.title
  };
}

async function refreshGitHub() {
  const results = { projects: [], prs: [], fetchedAt: new Date().toISOString() };
  for (const p of PROJECTS) {
    try { results.projects.push({ ...p, data: await fetchRepo(p.repo) }); }
    catch (e) { results.projects.push({ ...p, error: String(e.message || e) }); }
  }
  for (const p of PRS) {
    try { results.prs.push({ ...p, data: await fetchPR(p) }); }
    catch (e) { results.prs.push({ ...p, error: String(e.message || e) }); }
  }
  ghCache = results;
  ghCacheAt = Date.now();
  console.log('[dashboard] GitHub 数据刷新完成', new Date().toISOString());
}

// ---------- 服务器监控 ----------
function readMem() {
  const s = fs.readFileSync('/proc/meminfo', 'utf8');
  const map = {};
  for (const line of s.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) map[line.slice(0, i)] = parseInt(line.slice(i + 1), 10) || 0;
  }
  const total = map['MemTotal'] || 0, avail = map['MemAvailable'] || map['MemFree'] || 0;
  return { totalMB: Math.round(total / 1024), usedMB: Math.round((total - avail) / 1024), pct: Math.round((total - avail) / total * 100) };
}

function readDisk() {
  const out = require('child_process').execFileSync('df', ['-k', '/'], { encoding: 'utf8' });
  const parts = out.trim().split(/\s+/);
  const total = parseInt(parts[8], 10), used = parseInt(parts[9], 10);
  return { totalGB: +(total / 1048576).toFixed(1), usedGB: +(used / 1048576).toFixed(1), pct: Math.round(used / total * 100) };
}

function serverStatus() {
  const load = os.loadavg();
  const up = os.uptime();
  const upStr = up > 86400 ? Math.floor(up / 86400) + 'd ' + Math.floor(up % 86400 / 3600) + 'h'
    : up > 3600 ? Math.floor(up / 3600) + 'h ' + Math.floor(up % 3600 / 60) + 'm'
    : Math.floor(up / 60) + 'm';
  return {
    hostname: os.hostname(),
    load1: +load[0].toFixed(2), load5: +load[1].toFixed(2), load15: +load[2].toFixed(2),
    uptime: upStr, cores: os.cpus().length,
    mem: readMem(), disk: readDisk(),
    node: process.version,
    time: new Date().toISOString()
  };
}

// ---------- HTTP ----------
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (url === '/api/data') {
    const body = JSON.stringify({ github: ghCache || { projects: [], prs: [], fetchedAt: null }, server: serverStatus(), cacheMs: CACHE_MS });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[dashboard] listening on http://127.0.0.1:' + PORT);
});

// ---------- 定时刷新 ----------
refreshGitHub();
setInterval(refreshGitHub, CACHE_MS).unref();
