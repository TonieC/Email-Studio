'use strict';

const crypto = require('crypto');
const db = require('../db');
const DiffService = require('./DiffService');

function list(projectId) {
  return db.prepare(
    'SELECT id, project_id, label, created_at, LENGTH(html) AS html_size, LENGTH(css) AS css_size FROM versions WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
}

function get(id) {
  return db.prepare('SELECT * FROM versions WHERE id = ?').get(id) || null;
}

function snapshot(project, label) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO versions (id, project_id, html, css, visual_json, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, project.id, project.html || '', project.css || '', project.visual_json || '', label || null, now);
  const count = db.prepare('SELECT COUNT(*) AS n FROM versions WHERE project_id = ?').get(project.id).n;
  if (count > 50) {
    const old = db.prepare('SELECT id FROM versions WHERE project_id = ? ORDER BY created_at ASC LIMIT ?').all(project.id, count - 50);
    for (const row of old) db.prepare('DELETE FROM versions WHERE id = ?').run(row.id);
  }
  return get(id);
}

function remove(id) {
  return db.prepare('DELETE FROM versions WHERE id = ?').run(id).changes > 0;
}

function compare(aId, bId) {
  const a = get(aId);
  const b = get(bId);
  if (!a || !b) return null;
  return {
    a: { id: a.id, created_at: a.created_at, label: a.label },
    b: { id: b.id, created_at: b.created_at, label: b.label },
    html: DiffService.diff(a.html, b.html),
    css: DiffService.diff(a.css, b.css),
  };
}

module.exports = { list, get, snapshot, remove, compare };
