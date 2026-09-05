'use strict';

const express = require('express');
const ProjectService = require('../services/ProjectService');
const HistoryService = require('../services/HistoryService');
const ExportService = require('../services/ExportService');
const VersionService = require('../services/VersionService');
const FolderService = require('../services/FolderService');
const HtmlImportService = require('../services/HtmlImportService');
const MergeService = require('../services/MergeService');
const { requireAuth } = require('../middleware');
const { assertValid, validateProjectName } = require('../validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { q, folderId, tag, favorite, archived, trashed, sort } = req.query;
  return res.json({
    projects: ProjectService.list({
      q,
      folderId,
      tag,
      favorite: favorite === '1' || favorite === 'true',
      archived: archived === 'all' ? 'all' : (archived === '1' || archived === 'true'),
      trashed: trashed === 'all' ? 'all' : (trashed === '1' || trashed === 'true'),
      sort,
    }),
    folders: FolderService.list(),
  });
});

router.get('/search', (req, res) => {
  return res.json({ results: ProjectService.searchContent(req.query.q) });
});

router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};
    if (!assertValid(body.name, validateProjectName, res)) return;
    const project = ProjectService.create({
      name: String(body.name).trim(),
      html: body.html === undefined ? '' : String(body.html),
      css: body.css === undefined ? '' : String(body.css),
      tags: body.tags,
      folderId: body.folderId || null,
      subject: body.subject,
      preheader: body.preheader,
    });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
});

router.post('/import', (req, res, next) => {
  try {
    const body = req.body || {};
    const imported = HtmlImportService.importHtml(body.html || body.source || '');
    const project = ProjectService.create({
      name: String(body.name || 'Imported email').trim() || 'Imported email',
      html: imported.html,
      css: imported.css,
    });
    return res.status(201).json({ project, warnings: imported.warnings });
  } catch (err) {
    return next(err);
  }
});

router.post('/bulk', (req, res, next) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const action = String(body.action || '');
    const results = ProjectService.bulk(ids, action, { folderId: body.folderId, tags: body.tags });
    return res.json({ ok: true, count: results.length });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', (req, res) => {
  const project = ProjectService.getPublic(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  ProjectService.touchOpened(req.params.id);
  return res.json({ project: ProjectService.getPublic(req.params.id), variables: MergeService.listVariables(project.html, project.css) });
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
      tags: body.tags,
      folderId: body.folderId,
      favorite: body.favorite,
      archived: body.archived,
      trashed: body.trashed,
      subject: body.subject,
      preheader: body.preheader,
      from_name: body.from_name,
      reply_to: body.reply_to,
      visual_json: body.visual_json,
      crash_draft: body.crash_draft,
      to_addr: body.to_addr,
      cc_addr: body.cc_addr,
      bcc_addr: body.bcc_addr,
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

router.post('/:id/snapshot', (req, res, next) => {
  try {
    const project = ProjectService.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const version = VersionService.snapshot(project, req.body && req.body.label);
    return res.status(201).json({ version });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/versions', (req, res) => {
  const project = ProjectService.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.json({ versions: VersionService.list(req.params.id) });
});

router.get('/:id/versions/:vid', (req, res) => {
  const version = VersionService.get(req.params.vid);
  if (!version || version.project_id !== req.params.id) return res.status(404).json({ error: 'Version not found' });
  return res.json({ version });
});

router.post('/:id/versions/:vid/restore', (req, res, next) => {
  try {
    const version = VersionService.get(req.params.vid);
    if (!version || version.project_id !== req.params.id) return res.status(404).json({ error: 'Version not found' });
    const project = ProjectService.update(req.params.id, {
      html: version.html,
      css: version.css,
      visual_json: version.visual_json,
    });
    VersionService.snapshot(project, 'Restored ' + (version.label || version.id.slice(0, 8)));
    return res.json({ project });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/versions/:vid/duplicate', (req, res, next) => {
  try {
    const version = VersionService.get(req.params.vid);
    if (!version || version.project_id !== req.params.id) return res.status(404).json({ error: 'Version not found' });
    const project = ProjectService.create({
      name: (req.body && req.body.name) || 'Restored copy',
      html: version.html,
      css: version.css,
      visual_json: version.visual_json,
    });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/versions/:a/diff/:b', (req, res) => {
  const diff = VersionService.compare(req.params.a, req.params.b);
  if (!diff) return res.status(404).json({ error: 'Version not found' });
  return res.json({ diff });
});

router.delete('/:id', (req, res) => {
  const ok = ProjectService.remove(req.params.id);
  HistoryService.clear(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Project not found' });
  return res.json({ ok: true });
});

module.exports = router;
