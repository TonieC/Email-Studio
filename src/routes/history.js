'use strict';

const express = require('express');
const HistoryService = require('../services/HistoryService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { projectId } = req.query;
  const limit = parseInt(req.query.limit, 10) || 50;
  return res.json({ history: HistoryService.list({ projectId, limit }) });
});

router.delete('/', (req, res) => {
  HistoryService.clear(req.query.projectId);
  return res.json({ ok: true });
});

module.exports = router;
