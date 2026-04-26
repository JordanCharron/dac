import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from '../lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbDir = path.dirname(env.DB_FILE);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(env.DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const getApplied = db.prepare('SELECT 1 FROM _migrations WHERE name = ?');
  const markApplied = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (getApplied.get(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      markApplied.run(file);
      db.exec('COMMIT');
      console.log(`[db] migration applied: ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
