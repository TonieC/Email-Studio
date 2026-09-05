'use strict';

const crypto = require('crypto');
const db = require('../db');

/**
 * Opt-in architecture for future campaign analytics.
 * Tracking pixels, click wrapping and unsubscribe endpoints stay disabled
 * unless an operator explicitly enables them in settings.
 */
function isEnabled() {
  const SettingsService = require('./SettingsService');
  return !!SettingsService.get('tracking_enabled', false);
}

function record(type, data = {}) {
  if (!isEnabled()) return null;
  const allowed = ['open', 'click', 'bounce', 'unsubscribe', 'complaint'];
  if (!allowed.includes(type)) return null;
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO tracking_events (id, type, project_id, send_id, recipient, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    type,
    data.projectId || null,
    data.sendId || null,
    data.recipient || null,
    JSON.stringify(data.meta || {}),
    Date.now()
  );
  return id;
}

function list({ projectId, type, limit = 100 } = {}) {
  let sql = 'SELECT * FROM tracking_events WHERE 1=1';
  const params = [];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 100, 500));
  return db.prepare(sql).all(...params);
}

module.exports = { isEnabled, record, list };
