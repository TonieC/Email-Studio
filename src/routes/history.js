'use strict';

const express = require('express');
const HistoryService = require('../services/HistoryService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { projectId, q, accountId, status, from, to, kind } = req.query;
  const limit = parseInt(req.query.limit, 10) || 50;
  return res.json({ history: HistoryService.list({ projectId, limit, q, accountId, status, from, to, kind }) });
});

router.get('/:id', (req, res) => {
  const row = HistoryService.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'History item not found' });
  return res.json({ item: row });
});

router.delete('/', (req, res) => {
  HistoryService.clear(req.query.projectId);
  return res.json({ ok: true });
});

module.exports = router;
