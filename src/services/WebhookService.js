'use strict';

const crypto = require('crypto');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { clampStr } = require('../util');

const ALLOWED_EVENTS = [
  'send.success',
  'send.failure',
  'schedule.created',
  'schedule.cancelled',
  'schedule.sent',
  'auth.expired',
  'account.verify.failed',
];

function list() {
  return db.prepare('SELECT id, url, events, enabled, created_at FROM webhooks ORDER BY created_at DESC').all()
    .map((w) => ({ ...w, events: JSON.parse(w.events || '[]'), enabled: !!w.enabled }));
}

function create({ url, secret, events, enabled = true }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const ev = Array.isArray(events) ? events.filter((e) => ALLOWED_EVENTS.includes(e)) : ALLOWED_EVENTS.slice();
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) {
    const err = new Error('Webhook URL must be http(s)');
    err.status = 400;
    throw err;
  }
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(u)) {
    const err = new Error('Webhook URL is not allowed');
    err.status = 400;
    throw err;
  }
  const sec = String(secret || crypto.randomBytes(24).toString('hex'));
  db.prepare('INSERT INTO webhooks (id, url, secret_enc, events, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, clampStr(u, 500), encrypt(sec), JSON.stringify(ev), enabled ? 1 : 0, now);
  return { id, url: u, events: ev, enabled: !!enabled, secret: sec, created_at: now };
}

function remove(id) {
  return db.prepare('DELETE FROM webhooks WHERE id = ?').run(id).changes > 0;
}

function update(id, fields) {
  const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
  if (!row) return null;
  const events = fields.events ? JSON.stringify(fields.events.filter((e) => ALLOWED_EVENTS.includes(e))) : row.events;
  const enabled = fields.enabled === undefined ? row.enabled : (fields.enabled ? 1 : 0);
  db.prepare('UPDATE webhooks SET events = ?, enabled = ? WHERE id = ?').run(events, enabled, id);
  return list().find((w) => w.id === id);
}

async function emit(event, payload) {
  const rows = db.prepare('SELECT * FROM webhooks WHERE enabled = 1').all();
  for (const row of rows) {
    const events = JSON.parse(row.events || '[]');
    if (!events.includes(event)) continue;
    const secret = decrypt(row.secret_enc) || '';
    const body = JSON.stringify({ event, sent_at: Date.now(), payload });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    try {
      await fetch(row.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Email-Studio-Event': event,
          'X-Email-Studio-Signature': sig,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {
      /* swallow delivery errors */
    }
  }
}

module.exports = { list, create, remove, update, emit, ALLOWED_EVENTS };
