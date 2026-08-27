'use strict';

const crypto = require('crypto');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');

function newId() {
  return crypto.randomUUID();
}

function list() {
  return db.prepare('SELECT id, type, name, email, provider_id, created_at, updated_at FROM accounts ORDER BY created_at DESC').all();
}

function get(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null;
}

function getConfig(id) {
  const row = get(id);
  if (!row) return null;
  let config = {};
  if (row.config_enc) {
    const plain = decrypt(row.config_enc);
    if (plain) {
      try { config = JSON.parse(plain); } catch (_) { config = {}; }
    }
  }
  return { ...row, config };
}

function create({ type, name, email, providerId = null, config = {} }) {
  const id = newId();
  const now = Date.now();
  db.prepare('INSERT INTO accounts (id, type, name, email, provider_id, config_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, type, name, email, providerId, encrypt(JSON.stringify(config)), now, now);
  return get(id);
}

function update(id, fields) {
  const existing = get(id);
  if (!existing) return null;
  const configEnc = fields.config !== undefined ? encrypt(JSON.stringify(fields.config)) : undefined;
  db.prepare(`UPDATE accounts SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      provider_id = COALESCE(?, provider_id),
      config_enc = COALESCE(?, config_enc),
      updated_at = ?
    WHERE id = ?`)
    .run(
      fields.name === undefined ? null : fields.name,
      fields.email === undefined ? null : fields.email,
      fields.providerId === undefined ? null : fields.providerId,
      configEnc === undefined ? null : configEnc,
      Date.now(),
      id
    );
  return get(id);
}

function remove(id) {
  return db.prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
}

module.exports = { list, get, getConfig, create, update, remove, newId };
