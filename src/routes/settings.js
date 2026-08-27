'use strict';

const express = require('express');
const SettingsService = require('../services/SettingsService');
const StorageService = require('../services/StorageService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json({
    settings: SettingsService.getPublicSettings(),
    sendDefaults: SettingsService.getSendDefaults(),
    storage: StorageService.usage(),
    limits: { maxUploadBytes: require('../config').maxUploadBytes },
  });
});

router.put('/', (req, res, next) => {
  try {
    const body = req.body || {};
    const allowed = [
      ['appName', 'app_name', (v) => String(v || 'Email Studio').slice(0, 60)],
      ['publicBaseUrl', 'public_base_url', (v) => String(v || '').replace(/\/+$/, '').slice(0, 300)],
      ['inlineAssets', 'inline_assets', (v) => !!v],
      ['fromAddress', 'from_address', (v) => String(v || '').trim().slice(0, 300)],
      ['defaultAccountId', 'default_account_id', (v) => String(v || '').slice(0, 64)],
    ];
    for (const [field, key, normalize] of allowed) {
      if (body[field] !== undefined) SettingsService.set(key, normalize(body[field]));
    }
    return res.json({ settings: SettingsService.getPublicSettings(), sendDefaults: SettingsService.getSendDefaults() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
