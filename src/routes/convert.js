'use strict';

const express = require('express');
const ConversionService = require('../services/ConversionService');
const CompatibilityService = require('../services/CompatibilityService');
const SettingsService = require('../services/SettingsService');
const EmailDoctorService = require('../services/EmailDoctorService');
const MinifyService = require('../services/MinifyService');
const HtmlImportService = require('../services/HtmlImportService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};
    const html = String(body.html || '');
    const css = String(body.css || '');
    if (!html.trim()) return res.status(400).json({ error: 'HTML is required' });

    const settings = SettingsService.getPublicSettings();
    const options = {
      inlineAssets: body.inlineAssets !== undefined ? !!body.inlineAssets : settings.inlineAssets,
    };

    const result = ConversionService.convert({ html, css, options });
    const compatibility = CompatibilityService.analyze(result.html, css);

    return res.json({
      html: result.html,
      minified: result.minified,
      originalHtml: result.originalHtml,
      stats: result.stats,
      warnings: result.warnings,
      transformations: result.transformations,
      compatibility: compatibility.results,
      clients: compatibility.clients,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/import', (req, res, next) => {
  try {
    const imported = HtmlImportService.importHtml((req.body || {}).html || '');
    return res.json(imported);
  } catch (err) {
    return next(err);
  }
});

router.post('/minify', (req, res) => {
  const html = String((req.body || {}).html || '');
  const css = String((req.body || {}).css || '');
  return res.json({
    html: MinifyService.minifyHtml(html),
    css: MinifyService.minifyCss(css),
  });
});

router.post('/doctor', (req, res) => {
  const html = String((req.body || {}).html || '');
  const css = String((req.body || {}).css || '');
  return res.json(EmailDoctorService.analyze(html, css));
});

router.post('/doctor/fix', (req, res) => {
  const body = req.body || {};
  const result = EmailDoctorService.applyFixes(String(body.html || ''), String(body.css || ''), body.codes);
  return res.json(result);
});

router.post('/compatibility', (req, res) => {
  const html = String((req.body || {}).html || '');
  const css = String((req.body || {}).css || '');
  return res.json(CompatibilityService.analyze(html, css));
});

module.exports = router;
