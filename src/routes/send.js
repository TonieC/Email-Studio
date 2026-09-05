'use strict';

const express = require('express');
const EmailService = require('../services/EmailService');
const HistoryService = require('../services/HistoryService');
const AccountService = require('../services/AccountService');
const MergeService = require('../services/MergeService');
const ContactService = require('../services/ContactService');
const WebhookService = require('../services/WebhookService');
const { requireAuth, sendLimiter } = require('../middleware');
const { assertValid, isEmail, isValidEmailList } = require('../validators');

const router = express.Router();
router.use(requireAuth);
router.use(sendLimiter());

async function sendPayload(body, res) {
  const { accountId, to, cc, bcc, subject, from, html, projectId, projectName, kind, replyTo, contactId, variables } = body;

  if (!assertValid(accountId, 'An email account is required', res)) return null;
  if (!assertValid(to, (v) => (isEmail(v) ? null : 'A valid recipient email is required'), res)) return null;
  if (!assertValid(cc, (v) => (isValidEmailList(v) ? null : 'Invalid Cc address list'), res)) return null;
  if (!assertValid(bcc, (v) => (isValidEmailList(v) ? null : 'Invalid Bcc address list'), res)) return null;
  if (!assertValid(subject, String(subject || '').trim() ? null : 'Subject is required', res)) return null;
  if (!assertValid(String(subject).trim(), (s) => (s.length > 500 ? 'Subject is too long' : null), res)) return null;
  if (!assertValid(String(html || '').trim(), (s) => (s.length > 0 ? null : 'Email HTML is required'), res)) return null;

  const account = AccountService.get(accountId);
  if (!account) {
    res.status(404).json({ error: 'Email account not found' });
    return null;
  }

  let mergedHtml = String(html);
  const contact = contactId ? ContactService.get(contactId) : null;
  const vars = Object.assign({}, MergeService.contactVars(contact), variables || {});
  mergedHtml = MergeService.applyMerge(mergedHtml, vars);

  const toClean = String(to).trim();
  const size = Buffer.byteLength(mergedHtml, 'utf8');
  const kindVal = kind === 'test' ? 'test' : 'email';

  try {
    const info = await EmailService.send({
      accountId: account.id,
      to: toClean,
      cc: cc ? String(cc).trim() : undefined,
      bcc: bcc ? String(bcc).trim() : undefined,
      subject: String(subject).trim(),
      from: from ? String(from).trim() : undefined,
      html: mergedHtml,
      replyTo: replyTo ? String(replyTo).trim() : undefined,
    });
    HistoryService.record({
      projectId: projectId || null,
      projectName: projectName || null,
      toAddr: toClean,
      ccAddr: cc ? String(cc).trim() : null,
      bccAddr: bcc ? String(bcc).trim() : null,
      subject: String(subject).trim(),
      fromAddr: info.from,
      provider: info.provider,
      kind: kindVal,
      status: 'sent',
      error: null,
      size,
      accountId: account.id,
      accountName: account.name,
      versionId: body.versionId || null,
      replyTo: replyTo || null,
    });
    WebhookService.emit('send.success', { to: toClean, projectId, kind: kindVal }).catch(() => {});
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    HistoryService.record({
      projectId: projectId || null,
      projectName: projectName || null,
      toAddr: toClean,
      subject: String(subject).trim(),
      provider: account.type === 'gmail' ? 'gmail' : 'smtp',
      kind: kindVal,
      status: 'failed',
      error: err.message,
      size,
      accountId: account.id,
      accountName: account.name,
    });
    WebhookService.emit('send.failure', { to: toClean, error: err.message, projectId }).catch(() => {});
    if (err.code === 'GMAIL_AUTH_EXPIRED') {
      WebhookService.emit('auth.expired', { accountId: account.id }).catch(() => {});
    }
    const status = err.code === 'GMAIL_AUTH_EXPIRED' ? 401 : 502;
    res.status(status).json({ error: err.message, code: err.code || 'SEND_FAILED' });
    return null;
  }
}

router.post('/', async (req, res, next) => {
  try {
    const result = await sendPayload(req.body || {}, res);
    if (!result) return;
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const body = Object.assign({}, req.body || {}, { kind: 'test' });
    if (body.subject && !/^\[TEST\]/i.test(body.subject)) body.subject = '[TEST] ' + body.subject;
    const result = await sendPayload(body, res);
    if (!result) return;
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
