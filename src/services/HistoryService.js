'use strict';

const crypto = require('crypto');
const db = require('../db');

function record(entry) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO history
    (id, project_id, project_name, to_addr, cc_addr, bcc_addr, subject, from_addr, provider, kind, status, error, size, sent_at, account_id, account_name, version_id, reply_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
      now,
      entry.accountId || null,
      entry.accountName || null,
      entry.versionId || null,
      entry.replyTo || null
    );
  return id;
}

function list({ projectId, limit = 50, q, accountId, status, from, to, kind } = {}) {
  let sql = 'SELECT id, project_id, project_name, to_addr, cc_addr, bcc_addr, subject, from_addr, provider, kind, status, error, size, sent_at, account_id, account_name, version_id, reply_to FROM history WHERE 1=1';
  const params = [];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (accountId) { sql += ' AND account_id = ?'; params.push(accountId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (kind) { sql += ' AND kind = ?'; params.push(kind); }
  if (from) { sql += ' AND sent_at >= ?'; params.push(parseInt(from, 10)); }
  if (to) { sql += ' AND sent_at <= ?'; params.push(parseInt(to, 10)); }
  sql += ' ORDER BY sent_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 50, 500));
  let rows = db.prepare(sql).all(...params);
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((r) =>
      `${r.project_name || ''} ${r.to_addr || ''} ${r.subject || ''} ${r.account_name || ''} ${r.status}`.toLowerCase().includes(s));
  }
  return rows;
}

function get(id) {
  return db.prepare('SELECT * FROM history WHERE id = ?').get(id) || null;
}

function clear(projectId) {
  if (projectId) {
    db.prepare('DELETE FROM history WHERE project_id = ?').run(projectId);
  } else {
    db.prepare('DELETE FROM history').run();
  }
}

module.exports = { record, list, get, clear };
