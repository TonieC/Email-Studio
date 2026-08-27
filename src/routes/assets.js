'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const AssetService = require('../services/AssetService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  dest: path.join(config.dataDir, 'tmp'),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

router.get('/', (req, res) => {
  return res.json({ assets: AssetService.list() });
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit` });
      }
      return res.status(400).json({ error: err.message });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (req.file.size === 0) return res.status(400).json({ error: 'File is empty' });
      const asset = AssetService.create(req.file);
      return res.status(201).json({ asset: { ...asset, url: `/api/assets/${asset.id}/file` } });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  });
});

router.patch('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Name is required' });
  const asset = AssetService.rename(req.params.id, String(name).trim());
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  return res.json({ asset: { ...asset, url: `/api/assets/${asset.id}/file` } });
});

router.delete('/:id', (req, res) => {
  const ok = AssetService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Asset not found' });
  return res.json({ ok: true });
});

// Public asset file access (no auth) so recipients can load images in emails.
router.get('/:id/file', (req, res) => {
  const found = AssetService.readStream(req.params.id);
  if (!found) return res.status(404).json({ error: 'Asset not found' });
  res.set({
    'Content-Type': found.row.mime,
    'Content-Length': found.row.size,
    'Content-Disposition': `inline; filename="${found.row.original_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  return found.stream.pipe(res);
});

module.exports = router;
