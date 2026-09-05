'use strict';

const crypto = require('crypto');
const db = require('../db');
const EmailService = require('./EmailService');
const HistoryService = require('./HistoryService');
const AccountService = require('./AccountService');
const WebhookService = require('./WebhookService');
const { clampStr } = require('../util');

let timer = null;

function list({ status } = {}) {
  if (status) {
    return db.prepare('SELECT * FROM scheduled_sends WHERE status = ? ORDER BY scheduled_at ASC').all(status);
  }
  return db.prepare('SELECT * FROM scheduled_sends ORDER BY scheduled_at DESC LIMIT 200').all();
}

function get(id) {
  return db.prepare('SELECT * FROM scheduled_sends WHERE id = ?').get(id) || null;
}

function create(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const scheduledAt = parseInt(data.scheduledAt, 10);
  if (!scheduledAt || scheduledAt < now - 60000) {
    const err = new Error('A future date/time is required');
    err.status = 400;
    throw err;
  }
  db.prepare(`INSERT INTO scheduled_sends
    (id, project_id, project_name, version_id, account_id, to_addr, cc_addr, bcc_addr, subject, from_addr, reply_to, html, timezone, scheduled_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`)
    .run(
      id,
      data.projectId || null,
      data.projectName || null,
      data.versionId || null,
      data.accountId,
      clampStr(data.to, 500),
      data.cc || null,
      data.bcc || null,
      clampStr(data.subject, 500),
      data.from || null,
      data.replyTo || null,
      String(data.html || ''),
      clampStr(data.timezone || 'UTC', 80),
      scheduledAt,
      now,
      now
    );
  WebhookService.emit('schedule.created', { id, scheduledAt }).catch(() => {});
  return get(id);
}

function cancel(id) {
  const row = get(id);
  if (!row) return null;
  if (row.status !== 'scheduled') return row;
  db.prepare("UPDATE scheduled_sends SET status = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), id);
  WebhookService.emit('schedule.cancelled', { id }).catch(() => {});
  return get(id);
}

function reschedule(id, scheduledAt, timezone) {
  const row = get(id);
  if (!row || row.status !== 'scheduled') return null;
  const ts = parseInt(scheduledAt, 10);
  if (!ts || ts < Date.now() - 60000) {
    const err = new Error('A future date/time is required');
    err.status = 400;
    throw err;
  }
  db.prepare('UPDATE scheduled_sends SET scheduled_at = ?, timezone = COALESCE(?, timezone), updated_at = ? WHERE id = ?')
    .run(ts, timezone || null, Date.now(), id);
  return get(id);
}

async function dispatchDue() {
  const due = db.prepare("SELECT * FROM scheduled_sends WHERE status = 'scheduled' AND scheduled_at <= ?").all(Date.now());
  for (const row of due) {
    try {
      const info = await EmailService.send({
        accountId: row.account_id,
        to: row.to_addr,
        cc: row.cc_addr,
        bcc: row.bcc_addr,
        subject: row.subject,
        from: row.from_addr,
        html: row.html,
      });
      HistoryService.record({
        projectId: row.project_id,
        projectName: row.project_name,
        toAddr: row.to_addr,
        ccAddr: row.cc_addr,
        bccAddr: row.bcc_addr,
        subject: row.subject,
        fromAddr: info.from,
        provider: info.provider,
        kind: 'scheduled',
        status: 'sent',
        size: Buffer.byteLength(row.html || '', 'utf8'),
        accountId: row.account_id,
        versionId: row.version_id,
      });
      db.prepare("UPDATE scheduled_sends SET status = 'sent', updated_at = ?, error = NULL WHERE id = ?").run(Date.now(), row.id);
      WebhookService.emit('schedule.sent', { id: row.id }).catch(() => {});
      WebhookService.emit('send.success', { id: row.id, to: row.to_addr }).catch(() => {});
    } catch (err) {
      const account = AccountService.get(row.account_id);
      HistoryService.record({
        projectId: row.project_id,
        projectName: row.project_name,
        toAddr: row.to_addr,
        subject: row.subject,
        provider: account ? account.type : 'unknown',
        kind: 'scheduled',
        status: 'failed',
        error: err.message,
        size: Buffer.byteLength(row.html || '', 'utf8'),
        accountId: row.account_id,
      });
      db.prepare("UPDATE scheduled_sends SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
        .run(String(err.message).slice(0, 500), Date.now(), row.id);
      WebhookService.emit('send.failure', { id: row.id, error: err.message }).catch(() => {});
      if (err.code === 'GMAIL_AUTH_EXPIRED') {
        WebhookService.emit('auth.expired', { accountId: row.account_id }).catch(() => {});
      }
    }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => {
    dispatchDue().catch(() => {});
  }, 15000);
  if (timer.unref) timer.unref();
  dispatchDue().catch(() => {});
}

module.exports = { list, get, create, cancel, reschedule, dispatchDue, start };
