'use strict';

const crypto = require('crypto');
const db = require('../db');
const { clampStr } = require('../util');

function list() {
  return db.prepare('SELECT id, name, category, html, css, created_at, updated_at FROM blocks ORDER BY updated_at DESC').all();
}

function get(id) {
  return db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) || null;
}

function create({ name, category, html, css }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO blocks (id, name, category, html, css, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, clampStr(name || 'Block', 80), clampStr(category || 'custom', 40), String(html || ''), String(css || ''), now, now);
  return get(id);
}

function update(id, fields) {
  const existing = get(id);
  if (!existing) return null;
  db.prepare('UPDATE blocks SET name = COALESCE(?, name), category = COALESCE(?, category), html = COALESCE(?, html), css = COALESCE(?, css), updated_at = ? WHERE id = ?')
    .run(
      fields.name === undefined ? null : clampStr(fields.name, 80),
      fields.category === undefined ? null : clampStr(fields.category, 40),
      fields.html === undefined ? null : String(fields.html),
      fields.css === undefined ? null : String(fields.css),
      Date.now(),
      id
    );
  return get(id);
}

function remove(id) {
  return db.prepare('DELETE FROM blocks WHERE id = ?').run(id).changes > 0;
}

function duplicate(id) {
  const existing = get(id);
  if (!existing) return null;
  return create({
    name: existing.name + ' (copy)',
    category: existing.category,
    html: existing.html,
    css: existing.css,
  });
}

module.exports = { list, get, create, update, remove, duplicate };
