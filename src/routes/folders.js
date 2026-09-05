'use strict';

const express = require('express');
const FolderService = require('../services/FolderService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ folders: FolderService.list() }));

router.post('/', (req, res, next) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    const folder = FolderService.create(name, (req.body || {}).parentId);
    return res.status(201).json({ folder });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', (req, res) => {
  const folder = FolderService.rename(req.params.id, String((req.body || {}).name || ''));
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  return res.json({ folder });
});

router.delete('/:id', (req, res) => {
  const ok = FolderService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Folder not found' });
  return res.json({ ok: true });
});

module.exports = router;
