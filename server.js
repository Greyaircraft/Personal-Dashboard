#!/usr/bin/env node
/**
 * 个人仪表盘 - 零依赖 Node 服务
 * 端口: 18792 (仅 127.0.0.1), 由 Caddy 反代到 /dashboard/
 *
 * 功能:
 *  - GitHub 仓库状态 (star/fork/watch/浏览/clone) + PR 状态
 *
 * 环境变量:
 *  GH_TOKEN   GitHub classic token (读取 traffic 必需)
 *  PORT       监听端口 (默认 18792)
 *  CACHE_MS   GitHub 数据缓存时间 (默认 10 分钟)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '18792', 10);
const CACHE_MS = parseInt(process.env.CACHE_MS || '600000', 10);
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_API = 'https://api.github.com';

// ---------- 配置: 可监控的全部项目 (前端可选择) ----------
const ALL_PROJECTS = [
  {
    repo: 'Greyaircraft/PowerToysRun-PoetSearch',
    name: 'PoetSearch 插件',
    nameEn: 'PoetSearch Plugin',
    desc: 'PowerToys Run 古诗词搜索 · 78,581 首',
    descEn: 'PowerToys Run classical Chinese poetry search · 78,581 poems',
    url: 'https://github.com/Greyaircraft/PowerToysRun-PoetSearch',
    icon: '📜',
    key: 'poetsearch'
  },
  {
    repo: 'Greyaircraft/QuickAi-Plus',
    name: 'QuickAi-Plus',
    nameEn: 'QuickAi-Plus',
    desc: 'QuickAI 插件改造版 · LaTeX + Markdown 渲染 + 多 AI 预设',
    descEn: 'QuickAI mod · LaTeX + Markdown rendering + multiple AI presets',
    url: 'https://github.com/Greyaircraft/QuickAi-Plus',
    icon: '⚡',
    key: 'quickai'
  },
  {
    repo: 'Greyaircraft/Personal-Dashboard',
    name: 'Personal-Dashboard',
    nameEn: 'Personal-Dashboard',
    desc: '本项目 · 个人仪表盘',
    descEn: 'This project · personal dashboard',
    url: 'https://github.com/Greyaircraft/Personal-Dashboard',
    icon: '📊',
    key: 'dashboard'
  }
];

// 动态: 要拉取的项目 (支持从查询参数 /api/data?projects=key1,key2 过滤)
function selectedProjects(q) {
  if (!q) return ALL_PROJECTS;
  const keys = q.split(',').map(s => s.trim()).filter(Boolean);
  return ALL_PROJECTS.filter(p => keys.includes(p.key));
}

const PRS = [
  {
    repo: 'microsoft/PowerToys',
    num: 49946,
    name: 'PoetSearch 收录进官方列表',
    nameEn: 'PoetSearch added to official list',
    url: 'https://github.com/microsoft/PowerToys/pull/49946'
  },
  {
    repo: 'ruslanlap/PowerToysRun-QuickAi',
    num: 31,
    name: 'QuickAI 多 AI 预设',
    nameEn: 'QuickAI multiple AI presets',
    url: 'https://github.com/ruslanlap/PowerToysRun-QuickAi/pull/31'
  },
  {
    repo: 'ruslanlap/PowerToysRun-QuickAi',
    num: 26,
    name: 'QuickAI LaTeX + Markdown 渲染',
    nameEn: 'QuickAI LaTeX + Markdown rendering',
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

async function refreshGitHub(projects) {
  const list = projects || ALL_PROJECTS;
  const results = { projects: [], prs: [], fetchedAt: new Date().toISOString() };
  for (const p of list) {
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
    // 支持 ?projects=key1,key2 过滤
    const q = new URL(req.url, 'http://x').searchParams.get('projects');
    const list = selectedProjects(q);
    let projects = [], prs = [], fetchedAt = null;
    if (ghCache) {
      if (q && list.length) {
        projects = ghCache.projects.filter(cp => list.some(p => p.key === cp.key));
      } else {
        projects = ghCache.projects;
      }
      prs = ghCache.prs;
      fetchedAt = ghCache.fetchedAt;
      // 缓存缺选中项 → 后台全量补刷 (本次先返回已有)
      if (q && list.length && projects.length < list.length) refreshGitHub();
    } else {
      refreshGitHub(q && list.length ? list : undefined); // 首次: 后台刷
    }
    const body = JSON.stringify({ github: { projects, prs, fetchedAt }, cacheMs: CACHE_MS });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (url === '/api/projects') {
    const body = JSON.stringify(ALL_PROJECTS.map(({ repo, name, nameEn, key, icon }) => ({ repo, name, nameEn, key, icon })));
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
