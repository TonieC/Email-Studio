'use strict';

const crypto = require('crypto');
const db = require('../db');
const { clampStr } = require('../util');

function list() {
  return db.prepare('SELECT * FROM folders ORDER BY name').all();
}

function create(name, parentId) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')
    .run(id, clampStr(name || 'Untitled folder', 80), parentId || null, Date.now());
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
}

function rename(id, name) {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(clampStr(name, 80), id);
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) || null;
}

function remove(id) {
  db.prepare('UPDATE projects SET folder_id = NULL WHERE folder_id = ?').run(id);
  return db.prepare('DELETE FROM folders WHERE id = ?').run(id).changes > 0;
}

module.exports = { list, create, rename, remove };
