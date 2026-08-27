'use strict';

const express = require('express');
const EmailService = require('../services/EmailService');
const HistoryService = require('../services/HistoryService');
const AccountService = require('../services/AccountService');
const { requireAuth, sendLimiter } = require('../middleware');
const { assertValid, isEmail, isValidEmailList } = require('../validators');

const router = express.Router();
router.use(requireAuth);
router.use(sendLimiter());

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const { accountId, to, cc, bcc, subject, from, html, projectId, projectName, kind } = body;

    if (!assertValid(accountId, 'An email account is required', res)) return;
    if (!assertValid(to, (v) => (isEmail(v) ? null : 'A valid recipient email is required'), res)) return;
    if (!assertValid(cc, (v) => (isValidEmailList(v) ? null : 'Invalid Cc address list'), res)) return;
    if (!assertValid(bcc, (v) => (isValidEmailList(v) ? null : 'Invalid Bcc address list'), res)) return;
    if (!assertValid(subject, String(subject || '').trim() ? null : 'Subject is required', res)) return;
    if (!assertValid(String(subject).trim(), (s) => (s.length > 500 ? 'Subject is too long' : null), res)) return;
    if (!assertValid(String(html || '').trim(), (s) => (s.length > 0 ? null : 'Email HTML is required'), res)) return;

    const account = AccountService.get(accountId);
    if (!account) return res.status(404).json({ error: 'Email account not found' });

    const toClean = String(to).trim();
    const size = Buffer.byteLength(String(html), 'utf8');

    try {
      const info = await EmailService.send({
        accountId: account.id,
        to: toClean,
        cc: cc ? String(cc).trim() : undefined,
        bcc: bcc ? String(bcc).trim() : undefined,
        subject: String(subject).trim(),
        from: from ? String(from).trim() : undefined,
        html: String(html),
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
        kind: kind === 'test' ? 'test' : 'email',
        status: 'sent',
        error: null,
        size,
      });
      return res.json({ ok: true, messageId: info.messageId });
    } catch (err) {
      HistoryService.record({
        projectId: projectId || null,
        projectName: projectName || null,
        toAddr: toClean,
        subject: String(subject).trim(),
        provider: account.type === 'gmail' ? 'gmail' : 'smtp',
        kind: kind === 'test' ? 'test' : 'email',
        status: 'failed',
        error: err.message,
        size,
      });
      const status = err.code === 'GMAIL_AUTH_EXPIRED' ? 401 : 502;
      return res.status(status).json({ error: err.message, code: err.code || 'SEND_FAILED' });
    }
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
