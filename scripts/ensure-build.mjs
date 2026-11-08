#!/usr/bin/env node
/**
 * 启动前检查 web/dist 是不是比前端源码新。
 * web/dist 被 gitignore，git pull 不会更新它 —— 不重建就会一直跑旧包（改了没效果）。
 * 由 `启动.bat` 调用；`npm start` / `开发.bat` 不走这里。
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const distIndex = join(root, 'web', 'dist', 'index.html');

const SOURCE_INPUTS = [
  join(root, 'web', 'index.html'),
  join(root, 'web', 'src'),
  join(root, 'vite.config.ts'),
  join(root, 'package.json'),
  join(root, 'tsconfig.json'),
];

function newestMtime(target) {
  if (!existsSync(target)) return 0;
  const stat = statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(target, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath ?? entry.path, entry.name);
    const mtime = statSync(full).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

function stamp(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const sourceTime = Math.max(...SOURCE_INPUTS.map(newestMtime));
const distTime = existsSync(distIndex) ? statSync(distIndex).mtimeMs : 0;

if (distTime && distTime >= sourceTime) {
  console.log(`  前端已是最新（${stamp(distTime)}），跳过构建`);
  process.exit(0);
}

const reason = distTime ? 'web/src 比 web/dist 新' : '还没构建过 web/dist';
console.log(`  ${reason}，正在构建前端…`);
const result = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
if (result.status !== 0) {
  console.error('  [错误] 前端构建失败，请把上面的报错贴出来。');
  process.exit(result.status ?? 1);
}
console.log(`  前端构建完成（${stamp(statSync(distIndex).mtimeMs)}）`);
