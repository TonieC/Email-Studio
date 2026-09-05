'use strict';

const express = require('express');
const BlockService = require('../services/BlockService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ blocks: BlockService.list() }));

router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};
    const block = BlockService.create({
      name: body.name,
      category: body.category,
      html: body.html,
      css: body.css,
    });
    return res.status(201).json({ block });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', (req, res) => {
  const block = BlockService.get(req.params.id);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  return res.json({ block });
});

router.put('/:id', (req, res) => {
  const block = BlockService.update(req.params.id, req.body || {});
  if (!block) return res.status(404).json({ error: 'Block not found' });
  return res.json({ block });
});

router.post('/:id/duplicate', (req, res) => {
  const block = BlockService.duplicate(req.params.id);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  return res.status(201).json({ block });
});

router.delete('/:id', (req, res) => {
  const ok = BlockService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Block not found' });
  return res.json({ ok: true });
});

module.exports = router;
