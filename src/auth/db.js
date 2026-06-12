// src/auth/db.js
// SQLite database — OAuth 2.0 + PKCE tables
import Database from "better-sqlite3";

const db = new Database("oauth.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE,
    password_hash TEXT
);

CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id     TEXT PRIMARY KEY,
    client_secret TEXT,
    redirect_uris TEXT,
    client_name   TEXT,
    created_at    INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS auth_codes (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    redirect_uri          TEXT,
    user_id               TEXT NOT NULL,
    code_challenge        TEXT,
    code_challenge_method TEXT,
    expires_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS access_tokens (
    token      TEXT PRIMARY KEY,
    client_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);
`);

// Clean up expired rows on startup
db.exec(`
  DELETE FROM auth_codes    WHERE expires_at < ${Date.now()};
  DELETE FROM access_tokens WHERE expires_at < ${Date.now()};
`);

export default db;
