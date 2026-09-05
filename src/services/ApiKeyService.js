'use strict';

const crypto = require('crypto');
const db = require('../db');
const { clampStr } = require('../util');

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function list() {
  return db.prepare('SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys ORDER BY created_at DESC').all();
}

function create(name) {
  const id = crypto.randomUUID();
  const raw = 'es_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO api_keys (id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, clampStr(name || 'API key', 80), hashKey(raw), raw.slice(0, 10), now);
  return { id, name: clampStr(name || 'API key', 80), key: raw, key_prefix: raw.slice(0, 10), created_at: now };
}

function remove(id) {
  return db.prepare('DELETE FROM api_keys WHERE id = ?').run(id).changes > 0;
}

function verify(raw) {
  if (!raw || !String(raw).startsWith('es_')) return null;
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hashKey(String(raw)));
  if (!row) return null;
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return row;
}

module.exports = { list, create, remove, verify, hashKey };
