import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));

export const DIST_DIR = join(WEB_DIR, 'dist');
export const DIST_INDEX = join(DIST_DIR, 'index.html');

function newestMtime(target: string): number {
  if (!existsSync(target)) return 0;
  const stat = statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(target, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const mtime = statSync(join(entry.parentPath, entry.name)).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

function stamp(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface FrontendBuild {
  /** web/dist/index.html 的时间戳 */
  stamp: string;
  /** 入口 bundle 文件名，和浏览器请求的 /assets/… 对得上 */
  asset: string;
  /** 前端源码比 dist 新：说明忘了 npm run build，手机跑的还是旧包 */
  stale: boolean;
}

export function frontendBuild(): FrontendBuild | null {
  if (!existsSync(DIST_INDEX)) return null;
  const distTime = statSync(DIST_INDEX).mtimeMs;
  const html = readFileSync(DIST_INDEX, 'utf8');
  const asset = /\/assets\/(index-[\w.-]+\.js)/.exec(html)?.[1] ?? '?';
  const sourceTime = Math.max(
    newestMtime(join(WEB_DIR, 'src')),
    newestMtime(join(WEB_DIR, 'index.html')),
    newestMtime(fileURLToPath(new URL('../vite.config.ts', import.meta.url))),
  );
  return { stamp: stamp(distTime), asset, stale: sourceTime > distTime };
}
