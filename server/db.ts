import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

let db: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.DB_PATH ?? join(process.env.DATA_DIR ?? 'data', 'orbit.db');
}

/** 打开（并按需建表）单例数据库连接。测试可用 DB_PATH=:memory:。 */
export function getDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** 测试用：关闭并重置单例。 */
export function closeDb(): void {
  if (!db) return;
  db.close();
  db = null;
}
