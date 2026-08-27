'use strict';

const express = require('express');
const ProjectService = require('../services/ProjectService');
const HistoryService = require('../services/HistoryService');
const ExportService = require('../services/ExportService');
const { requireAuth } = require('../middleware');
const { assertValid, validateProjectName } = require('../validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json({ projects: ProjectService.list() });
});

router.post('/', (req, res, next) => {
  try {
    if (!assertValid(req.body && req.body.name, validateProjectName, res)) return;
    const project = ProjectService.create({ name: String(req.body.name).trim() });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', (req, res) => {
  const project = ProjectService.getPublic(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.json({ project });
});

router.get('/:id/export', (req, res, next) => {
  try {
    const project = ProjectService.getPublic(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const base = ExportService.safeBaseName(project.name);
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.html"`);
      return res.send(ExportService.buildHtml(project));
    }
    const buf = ExportService.buildZip(project);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.zip"`);
    return res.send(buf);
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.name !== undefined && !assertValid(body.name, validateProjectName, res)) return;
    const project = ProjectService.update(req.params.id, {
      name: body.name === undefined ? undefined : String(body.name).trim(),
      html: body.html === undefined ? undefined : String(body.html),
      css: body.css === undefined ? undefined : String(body.css),
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ project });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/duplicate', (req, res, next) => {
  try {
    const project = ProjectService.duplicate(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', (req, res) => {
  const ok = ProjectService.remove(req.params.id);
  HistoryService.clear(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Project not found' });
  return res.json({ ok: true });
});

module.exports = router;
