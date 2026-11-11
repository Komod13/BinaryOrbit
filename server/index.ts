import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import qrcode from 'qrcode-terminal';
import { getConfig, loadEnvFile, validateConfig } from './env.ts';
import { getDb } from './db.ts';
import { AmapError, handleAmapService } from './amap.ts';
import { ValidationError } from './validate.ts';
import { configRoute } from './routes/config.ts';
import { placesRoute } from './routes/places.ts';
import { visitsRoute } from './routes/visits.ts';
import { citiesRoute } from './routes/cities.ts';
import { statsRoute } from './routes/stats.ts';
import { searchRoute } from './routes/search.ts';
import { regeoRoute } from './routes/regeo.ts';
import { diagRoute } from './routes/diag.ts';
import { cityDictCount, syncCityDict } from './cities.ts';
import { pickLanAddress } from './net.ts';
import { DIST_DIR, DIST_INDEX, frontendBuild } from './build.ts';

export function createApp() {
  const app = new Hono();

  app.use('/*', async (c, next) => {
    const started = Date.now();
    await next();
    const ms = Date.now() - started;
    const path = c.req.path;

    // 带 hash 的 /assets 可以长缓存；HTML 必须每次回源，否则改完前端在手机上刷新还是旧页面
    const cacheControl =
      path.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : path.startsWith('/api/') || path.startsWith('/_AMapService/')
          ? 'no-store'
          : 'no-cache';
    try {
      c.res.headers.set('cache-control', cacheControl);
    } catch {
      /* 响应头不可写就算了 */
    }

    if (ms > 800) console.log(`[slow] ${c.req.method} ${path} ${ms}ms`);
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  app.get('/api/health', (c) => c.json({ ok: true, uptime: process.uptime() }));

  app.route('/api/config', configRoute);
  app.route('/api/places', placesRoute);
  app.route('/api/visits', visitsRoute);
  app.route('/api/cities', citiesRoute);
  app.route('/api/stats', statsRoute);
  app.route('/api/search', searchRoute);
  app.route('/api/regeo', regeoRoute);
  app.route('/api/diag', diagRoute);

  app.all('/_AMapService/*', (c) => handleAmapService(c.req.raw, new URL(c.req.url)));

  // API 的 404 必须在静态托管之前兜住，否则会掉进 SPA fallback 返回 index.html
  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

  app.notFound((c) => {
    return c.text('Not Found', 404);
  });

  app.onError((error, c) => {
    const isApi = c.req.path.startsWith('/api/') || c.req.path.startsWith('/_AMapService/');
    if (error instanceof ValidationError) {
      return isApi ? c.json({ error: error.message }, 400) : c.text(error.message, 400);
    }
    if (error instanceof AmapError) {
      return isApi ? c.json({ error: error.message, infocode: error.infocode }, 502) : c.text(error.message, 502);
    }
    console.error(`[error] ${c.req.method} ${c.req.path}`, error);
    return isApi ? c.json({ error: error.message ?? '服务器内部错误' }, 500) : c.text('服务器内部错误', 500);
  });

  if (existsSync(DIST_INDEX)) {
    app.use('/*', serveStatic({ root: DIST_DIR }));
    app.get('*', serveStatic({ path: DIST_INDEX }));
  } else {
    app.get('*', (c) =>
      c.html(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>双星轨道</title>
<body style="font-family:system-ui;padding:40px;line-height:1.8;background:#ECEDE6;color:#1C1E1C">
<h1>后端已启动，但前端还没有构建</h1>
<p>开发模式：另开一个终端执行 <code>npm run dev:web</code>，然后访问 Vite 的 5173 端口。</p>
<p>生产模式：执行 <code>npm run build</code> 后刷新本页。</p>
<p>接口自检：<a href="/api/health">/api/health</a> · <a href="/api/config">/api/config</a></p>
</body></html>`,
        200,
      ),
    );
  }

  return app;
}

function openBrowser(url: string): void {
  if (process.env.NO_OPEN === '1') return;
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    // spawn 找不到可执行文件时不会同步抛错，而是异步发 'error' 事件；
    // 不监听会让整个进程退出（无桌面环境的 Linux / Docker 很常见）
    child.on('error', () => {
      /* 打不开就算了，控制台里有地址 */
    });
    child.unref();
  } catch {
    /* 打不开就算了，控制台里有地址 */
  }
}

function printBanner(port: number): void {
  const picked = pickLanAddress(undefined, process.env.LAN_IP);
  const local = `http://localhost:${port}`;
  const phone = picked.address ? `http://${picked.address}:${port}` : '（未检测到局域网 IP，请检查网络）';

  console.log('');
  console.log('  BinaryOrbit · 双星轨道');
  console.log(`  本机   ${local}`);
  console.log(`  手机   ${phone}`);
  console.log('');
  if (picked.address) {
    qrcode.generate(phone, { small: true }, (code) => console.log(code));
  }

  // 有多个地址时把其余的列出来：Windows 上装代理 / 虚拟机会多出好几张网卡
  const others = picked.candidates.filter((candidate) => candidate.address !== picked.address);
  if (others.length) {
    console.log(`  其他网卡   ${others.map((item) => `${item.address}（${item.name}）`).join('、')}`);
    console.log('  手机连不上就用正确的那一个：在 .env 里加 LAN_IP=192.168.x.x 后重启');
    console.log('');
  }

  if (picked.overrideError) {
    console.log(`  [warn] ${picked.overrideError}`);
    console.log('');
  }
  if (!picked.address) {
    console.log('  没找到可用的局域网地址：确认已连上 WiFi / 路由器，或把地址写进 .env 的 LAN_IP');
    console.log('');
  }

  console.log('  手机需与电脑连同一个 WiFi；首次连接请在 Windows 防火墙弹窗里选「专用网络」。');

  const build = frontendBuild();
  if (build) {
    console.log(`  前端   ${build.asset} · ${build.stamp}`);
    if (build.stale) {
      console.log('  [warn] web/src 比 web/dist 新：先跑 npm run build，否则手机拿到的还是旧前端');
    }
  } else {
    console.log('  前端   还没有构建（npm run build）');
  }
  console.log('  自检   手机上打开 <地址>?debug=1，左下角会显示帧率并可一键上报到这里');
  console.log('');
}

async function bootstrapCityDict(): Promise<void> {
  if (cityDictCount() > 0) return;
  try {
    const count = await syncCityDict();
    console.log(`  城市字典已同步：${count} 条`);
  } catch (error) {
    console.warn(
      `  [warn] 城市字典同步失败（城市归属可能落空，可在网络正常后重启）：${(error as Error).message}`,
    );
  }
}

function main(): void {
  loadEnvFile();

  const config = getConfig();
  const problems = validateConfig(config);
  if (problems.length) {
    console.error('');
    for (const line of problems) console.error(`  ${line}`);
    console.error('');
    process.exit(1);
  }

  getDb();
  void bootstrapCityDict();
  const app = createApp();

  const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, () => {
    printBanner(config.port);
    openBrowser(`http://localhost:${config.port}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  端口 ${config.port} 已被占用：程序似乎已经在运行了，已为你打开浏览器。\n`);
      openBrowser(`http://localhost:${config.port}`);
      process.exit(0);
    }
    console.error('[server error]', error);
    process.exit(1);
  });
}

const entry = process.argv[1];
const isDirectRun = Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
if (isDirectRun) main();
