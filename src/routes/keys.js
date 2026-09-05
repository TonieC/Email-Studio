'use strict';

const express = require('express');
const ApiKeyService = require('../services/ApiKeyService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ keys: ApiKeyService.list() }));

router.post('/', (req, res) => {
  const name = String((req.body || {}).name || 'API key');
  const key = ApiKeyService.create(name);
  return res.status(201).json({ key });
});

router.delete('/:id', (req, res) => {
  const ok = ApiKeyService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'API key not found' });
  return res.json({ ok: true });
});

module.exports = router;
