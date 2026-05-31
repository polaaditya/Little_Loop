/* ─── Database abstraction layer ─────────────────────────────────────────
   Local dev  → SQLite  via Node.js built-in node:sqlite (Node 22+)
                         No native compilation needed.
   Production → PostgreSQL via DATABASE_URL env var  (e.g. AWS RDS)

   Public API:
     db.init()            — connect + create tables
     db.run(sql, params)  — INSERT / UPDATE / DELETE  → { id, changes }
     db.get(sql, params)  → single row object | undefined
     db.all(sql, params)  → array of row objects
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
const path = require('path');
const fs   = require('fs');

let _db;
let _type; // 'sqlite' | 'pg'

/* ─── Convert SQLite ?-placeholders to PostgreSQL $1,$2,… ─────────────── */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/* ─── Initialise connection + schema ──────────────────────────────────── */
async function init() {
  const url = process.env.DATABASE_URL;

  if (url) {
    /* ── PostgreSQL ────────────────────────────────────────────────────── */
    const { Pool } = require('pg');
    _db = new Pool({
      connectionString: url,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });
    _type = 'pg';
    const client = await _db.connect();
    client.release();
    console.log('✓ Connected to PostgreSQL');
  } else {
    /* ── SQLite — Node.js built-in (Node 22+, no compilation needed) ─── */
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = process.env.SQLITE_PATH
      || path.join(__dirname, '../data/littleloop.db');

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db   = new DatabaseSync(dbPath);
    _type = 'sqlite';
    _db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    console.log(`✓ Connected to SQLite at ${dbPath}`);
  }

  await _createTables();
  await _migrate();
}

/* ─── Safe migrations (idempotent) ───────────────────────────────────── */
async function _migrate() {
  if (_type === 'sqlite') {
    try { _db.exec('ALTER TABLE memories ADD COLUMN image_data TEXT'); }         catch { }
    try { _db.exec('ALTER TABLE families ADD COLUMN invite_token TEXT'); }        catch { }
    try { _db.exec('ALTER TABLE members  ADD COLUMN role TEXT NOT NULL DEFAULT \'Member\''); } catch { }
  } else {
    await _db.query('ALTER TABLE memories ADD COLUMN IF NOT EXISTS image_data TEXT').catch(() => {});
    await _db.query('ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_token TEXT').catch(() => {});
  }
}

/* ─── Schema ──────────────────────────────────────────────────────────── */
async function _createTables() {
  if (_type === 'sqlite') {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS families (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT    NOT NULL,
        invite_token TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS members (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id  INTEGER REFERENCES families(id) ON DELETE CASCADE,
        name       TEXT    NOT NULL,
        role       TEXT    NOT NULL DEFAULT 'Parent',
        age_stage  TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS loops (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id  INTEGER REFERENCES families(id) ON DELETE CASCADE,
        loop_type  TEXT NOT NULL,
        prompt     TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS responses (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        loop_id    INTEGER REFERENCES loops(id) ON DELETE CASCADE,
        member_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
        content    TEXT    NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS memories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id  INTEGER REFERENCES families(id) ON DELETE CASCADE,
        member_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
        content    TEXT    NOT NULL,
        image_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS care_steps (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id  INTEGER REFERENCES families(id) ON DELETE CASCADE,
        member_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
        step_date  DATE    NOT NULL DEFAULT (date('now')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        family_id     INTEGER REFERENCES families(id) ON DELETE SET NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    await _db.query(`
      CREATE TABLE IF NOT EXISTS families (
        id           SERIAL PRIMARY KEY,
        name         TEXT      NOT NULL,
        invite_token TEXT,
        created_at   TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS members (
        id         SERIAL PRIMARY KEY,
        family_id  INTEGER   REFERENCES families(id) ON DELETE CASCADE,
        name       TEXT      NOT NULL,
        role       TEXT      NOT NULL DEFAULT 'Parent',
        age_stage  TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS loops (
        id         SERIAL PRIMARY KEY,
        family_id  INTEGER   REFERENCES families(id) ON DELETE CASCADE,
        loop_type  TEXT      NOT NULL,
        prompt     TEXT      NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS responses (
        id         SERIAL PRIMARY KEY,
        loop_id    INTEGER   REFERENCES loops(id) ON DELETE CASCADE,
        member_id  INTEGER   REFERENCES members(id) ON DELETE SET NULL,
        content    TEXT      NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS memories (
        id         SERIAL PRIMARY KEY,
        family_id  INTEGER   REFERENCES families(id) ON DELETE CASCADE,
        member_id  INTEGER   REFERENCES members(id) ON DELETE SET NULL,
        content    TEXT      NOT NULL,
        image_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS care_steps (
        id         SERIAL PRIMARY KEY,
        family_id  INTEGER   REFERENCES families(id) ON DELETE CASCADE,
        member_id  INTEGER   REFERENCES members(id) ON DELETE SET NULL,
        step_date  DATE      NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          TEXT      NOT NULL,
        email         TEXT      NOT NULL UNIQUE,
        password_hash TEXT      NOT NULL,
        family_id     INTEGER   REFERENCES families(id) ON DELETE SET NULL,
        created_at    TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
  }
  console.log('✓ Tables ready');
}

/* ─── Query helpers ───────────────────────────────────────────────────── */
async function run(sql, params = []) {
  if (_type === 'sqlite') {
    const stmt   = _db.prepare(sql);
    const result = stmt.run(...params);
    return { id: result.lastInsertRowid, changes: result.changes };
  } else {
    const result = await _db.query(toPg(sql), params);
    return { id: result.rows[0]?.id ?? null, changes: result.rowCount };
  }
}

async function get(sql, params = []) {
  if (_type === 'sqlite') {
    return _db.prepare(sql).get(...params);
  } else {
    const result = await _db.query(toPg(sql), params);
    return result.rows[0];
  }
}

async function all(sql, params = []) {
  if (_type === 'sqlite') {
    return _db.prepare(sql).all(...params);
  } else {
    const result = await _db.query(toPg(sql), params);
    return result.rows;
  }
}

module.exports = { init, run, get, all };
