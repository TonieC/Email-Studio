'use strict';

const express = require('express');
const prettier = require('prettier');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const source = String(body.source || body.html || body.css || '');
    const language = body.language === 'css' ? 'css' : 'html';
    const plugins = [];
    try {
      plugins.push(require('prettier/plugins/html'));
    } catch (_) { /* bundled parser */ }
    try {
      plugins.push(require('prettier/plugins/postcss'));
    } catch (_) { /* optional */ }
    const formatted = await prettier.format(source, {
      parser: language === 'css' ? 'css' : 'html',
      plugins,
      htmlWhitespaceSensitivity: 'ignore',
      tabWidth: 2,
      printWidth: 120,
    });
    return res.json({ formatted });
  } catch (err) {
    return res.status(400).json({ error: 'Format failed: ' + err.message });
  }
});

module.exports = router;
