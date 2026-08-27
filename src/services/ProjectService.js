'use strict';

const crypto = require('crypto');
const db = require('../db');

function newId() {
  return crypto.randomUUID();
}

function list() {
  return db.prepare('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC').all();
}

function get(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) || null;
}

function getPublic(id) {
  return db.prepare('SELECT id, name, html, css, created_at, updated_at FROM projects WHERE id = ?').get(id) || null;
}

function create({ name, html = '', css = '' }) {
  const id = newId();
  const now = Date.now();
  db.prepare('INSERT INTO projects (id, name, html, css, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, html, css, now, now);
  return get(id);
}

function update(id, { name, html, css }) {
  const existing = get(id);
  if (!existing) return null;
  const now = Date.now();
  db.prepare('UPDATE projects SET name = COALESCE(?, name), html = COALESCE(?, html), css = COALESCE(?, css), updated_at = ? WHERE id = ?')
    .run(name === undefined ? null : name, html === undefined ? null : html, css === undefined ? null : css, now, id);
  return get(id);
}

function remove(id) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

function duplicate(id) {
  const existing = get(id);
  if (!existing) return null;
  return create({
    name: existing.name + ' (copy)',
    html: existing.html,
    css: existing.css,
  });
}

module.exports = { list, get, getPublic, create, update, remove, duplicate, newId };
