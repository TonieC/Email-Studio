'use strict';

const express = require('express');
const ScheduleService = require('../services/ScheduleService');
const AccountService = require('../services/AccountService');
const MergeService = require('../services/MergeService');
const { requireAuth, sendLimiter } = require('../middleware');
const { assertValid, isEmail, isValidEmailList } = require('../validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json({ scheduled: ScheduleService.list({ status: req.query.status }) });
});

router.post('/', sendLimiter(), (req, res, next) => {
  try {
    const body = req.body || {};
    if (!assertValid(body.accountId, 'An email account is required', res)) return;
    if (!assertValid(body.to, (v) => (isEmail(v) ? null : 'A valid recipient email is required'), res)) return;
    if (!assertValid(body.cc, (v) => (isValidEmailList(v) ? null : 'Invalid Cc address list'), res)) return;
    if (!assertValid(body.bcc, (v) => (isValidEmailList(v) ? null : 'Invalid Bcc address list'), res)) return;
    if (!assertValid(body.subject, String(body.subject || '').trim() ? null : 'Subject is required', res)) return;
    if (!assertValid(String(body.html || '').trim(), (s) => (s.length > 0 ? null : 'Email HTML is required'), res)) return;
    const account = AccountService.get(body.accountId);
    if (!account) return res.status(404).json({ error: 'Email account not found' });
    const html = MergeService.applyMerge(String(body.html), body.variables || {});
    const row = ScheduleService.create({
      projectId: body.projectId,
      projectName: body.projectName,
      versionId: body.versionId,
      accountId: body.accountId,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      from: body.from,
      replyTo: body.replyTo,
      html,
      timezone: body.timezone,
      scheduledAt: body.scheduledAt,
    });
    return res.status(201).json({ scheduled: row });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/cancel', (req, res) => {
  const row = ScheduleService.cancel(req.params.id);
  if (!row) return res.status(404).json({ error: 'Scheduled send not found' });
  return res.json({ scheduled: row });
});

router.post('/:id/reschedule', (req, res, next) => {
  try {
    const row = ScheduleService.reschedule(req.params.id, (req.body || {}).scheduledAt, (req.body || {}).timezone);
    if (!row) return res.status(404).json({ error: 'Scheduled send not found' });
    return res.json({ scheduled: row });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
