'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const AssetService = require('../services/AssetService');
const ImageProcessService = require('../services/ImageProcessService');
const { requireAuth } = require('../middleware');

const router = express.Router();

const upload = multer({
  dest: path.join(config.dataDir, 'tmp'),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

router.get('/', requireAuth, (req, res) => {
  let assets = AssetService.list();
  const { q, sort, unused, mime } = req.query;
  if (q) {
    const s = String(q).toLowerCase();
    assets = assets.filter((a) => String(a.original_name).toLowerCase().includes(s));
  }
  if (unused === '1' || unused === 'true') assets = assets.filter((a) => a.unused);
  if (mime) assets = assets.filter((a) => a.mime === mime);
  if (sort === 'name') assets.sort((a, b) => String(a.original_name).localeCompare(String(b.original_name)));
  else if (sort === 'size') assets.sort((a, b) => b.size - a.size);
  else if (sort === 'usage') assets.sort((a, b) => (b.usage || 0) - (a.usage || 0));
  return res.json({ assets });
});

router.post('/', requireAuth, (req, res, next) => {
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
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      return res.status(201).json({ asset: { ...asset, url: `/api/assets/${asset.id}/file` } });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  });
});

router.patch('/:id', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Name is required' });
  const asset = AssetService.rename(req.params.id, String(name).trim());
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  return res.json({ asset: { ...asset, url: `/api/assets/${asset.id}/file` } });
});

router.post('/:id/replace', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const asset = AssetService.replace(req.params.id, req.file);
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      return res.json({ asset: { ...asset, url: `/api/assets/${asset.id}/file` } });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  });
});

router.post('/:id/process', requireAuth, (req, res) => {
  const row = AssetService.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Asset not found' });
  const filePath = path.join(config.dataDir, 'assets', row.stored_name);
  const result = ImageProcessService.processFile(filePath, req.body || {});
  if (result.processed) {
    const stat = fs.statSync(result.path || filePath);
    const dim = ImageProcessService.readDimensions(result.path || filePath);
    require('../db').prepare('UPDATE assets SET size = ?, width = ?, height = ? WHERE id = ?')
      .run(stat.size, dim.width, dim.height, row.id);
  }
  return res.json({ ok: true, result, asset: AssetService.get(row.id) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const ok = AssetService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Asset not found' });
  return res.json({ ok: true });
});

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
