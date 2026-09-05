'use strict';

const express = require('express');
const { requireAuthOrApiKey, restLimiter } = require('../middleware');
const CompatibilityService = require('../services/CompatibilityService');

const router = express.Router();
router.use(restLimiter());
router.use(requireAuthOrApiKey);

router.use('/projects', require('./projects'));
router.use('/templates', require('./templates'));
router.use('/assets', require('./assets'));
router.use('/convert', require('./convert'));
router.post('/compatibility', (req, res, next) => {
  try {
    const html = String((req.body || {}).html || '');
    const css = String((req.body || {}).css || '');
    return res.json(CompatibilityService.analyze(html, css));
  } catch (err) {
    return next(err);
  }
});
router.use('/accounts', require('./accounts'));
router.use('/send', require('./send'));
router.use('/history', require('./history'));

module.exports = router;
