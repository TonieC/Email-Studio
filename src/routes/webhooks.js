'use strict';

const express = require('express');
const WebhookService = require('../services/WebhookService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ webhooks: WebhookService.list(), events: WebhookService.ALLOWED_EVENTS }));

router.post('/', (req, res, next) => {
  try {
    const webhook = WebhookService.create(req.body || {});
    return res.status(201).json({ webhook });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', (req, res) => {
  const webhook = WebhookService.update(req.params.id, req.body || {});
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
  return res.json({ webhook });
});

router.delete('/:id', (req, res) => {
  const ok = WebhookService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Webhook not found' });
  return res.json({ ok: true });
});

module.exports = router;
