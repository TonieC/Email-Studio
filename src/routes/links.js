'use strict';

const express = require('express');
const LinkService = require('../services/LinkService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.post('/analyze', (req, res) => {
  const html = String((req.body || {}).html || '');
  return res.json({ links: LinkService.extract(html) });
});

router.post('/utm', (req, res) => {
  const body = req.body || {};
  const url = LinkService.withUtm(body.url, body);
  return res.json({ url });
});

module.exports = router;
