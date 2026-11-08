PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS place (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK (type IN ('restaurant','spot')),
  name         TEXT NOT NULL,
  external_id  TEXT UNIQUE,
  address      TEXT,
  lng          REAL NOT NULL,
  lat          REAL NOT NULL,
  category     TEXT,
  city_name    TEXT,
  city_adcode  TEXT,
  district     TEXT,
  created_time TEXT NOT NULL DEFAULT (datetime('now')),
  updated_time TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id     INTEGER NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  visited_date TEXT NOT NULL,
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  price_tier   TEXT CHECK (price_tier IN ('low','mid','high')),
  note         TEXT,
  created_time TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visit_place ON visit(place_id, visited_date DESC);

CREATE TABLE IF NOT EXISTS city_manual (
  adcode      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  marked_time TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS city_dict (
  adcode TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  lng    REAL,
  lat    REAL
);

CREATE INDEX IF NOT EXISTS idx_city_dict_name ON city_dict(name);
