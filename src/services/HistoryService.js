'use strict';

const crypto = require('crypto');
const db = require('../db');

function record(entry) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO history
    (id, project_id, project_name, to_addr, cc_addr, bcc_addr, subject, from_addr, provider, kind, status, error, size, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      entry.projectId || null,
      entry.projectName || null,
      entry.toAddr || '',
      entry.ccAddr || null,
      entry.bccAddr || null,
      entry.subject || '',
      entry.fromAddr || null,
      entry.provider || '',
      entry.kind || 'email',
      entry.status || 'unknown',
      entry.error || null,
      entry.size || 0,
      now
    );
  return id;
}

function list({ projectId, limit = 50 } = {}) {
  let rows;
  if (projectId) {
    rows = db.prepare(
      'SELECT id, project_id, project_name, to_addr, cc_addr, bcc_addr, subject, from_addr, provider, kind, status, error, size, sent_at FROM history WHERE project_id = ? ORDER BY sent_at DESC LIMIT ?'
    ).all(projectId, Math.min(limit, 500));
  } else {
    rows = db.prepare(
      'SELECT id, project_id, project_name, to_addr, cc_addr, bcc_addr, subject, from_addr, provider, kind, status, error, size, sent_at FROM history ORDER BY sent_at DESC LIMIT ?'
    ).all(Math.min(limit, 500));
  }
  return rows;
}

function clear(projectId) {
  if (projectId) {
    db.prepare('DELETE FROM history WHERE project_id = ?').run(projectId);
  } else {
    db.prepare('DELETE FROM history').run();
  }
}

module.exports = { record, list, clear };
