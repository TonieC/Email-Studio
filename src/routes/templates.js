'use strict';

const express = require('express');
const TemplateService = require('../services/TemplateService');
const ProjectService = require('../services/ProjectService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json({ templates: TemplateService.list() });
});

router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};
    const key = String(body.key || ('custom-' + Date.now().toString(36))).replace(/[^a-z0-9_-]/gi, '');
    const name = String(body.name || 'Custom template').trim();
    const description = String(body.description || 'Custom template').trim();
    const html = String(body.html || '');
    const css = String(body.css || '');
    TemplateService.save(key, name, description, html, css);
    return res.status(201).json({ template: { key, name, description } });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:key', (req, res) => {
  const ok = TemplateService.remove(req.params.key);
  if (!ok) return res.status(404).json({ error: 'Template not found' });
  return res.json({ ok: true });
});

router.get('/:key', (req, res) => {
  const template = TemplateService.get(req.params.key);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  return res.json({ template });
});

router.post('/:key/use', (req, res, next) => {
  try {
    const template = TemplateService.get(req.params.key);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const project = ProjectService.create({
      name: template.name,
      html: template.html,
      css: template.css,
    });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
