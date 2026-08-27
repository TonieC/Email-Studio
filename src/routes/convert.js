'use strict';

const express = require('express');
const ConversionService = require('../services/ConversionService');
const CompatibilityService = require('../services/CompatibilityService');
const SettingsService = require('../services/SettingsService');
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
      stats: result.stats,
      warnings: result.warnings,
      compatibility: compatibility.results,
      clients: compatibility.clients,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
