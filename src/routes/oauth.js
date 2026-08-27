'use strict';

const express = require('express');
const OAuthService = require('../services/OAuthService');
const SettingsService = require('../services/SettingsService');

const router = express.Router();

router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      const msg = error === 'access_denied' ? 'Gmail authorization was denied' : `Gmail authorization failed: ${error}`;
      return res.redirect(`/?flash=${encodeURIComponent(msg)}&flash_type=error`);
    }
    if (!code) return res.status(400).send('Missing authorization code');
    if (!OAuthService.isConfigured()) return res.status(400).send('Gmail OAuth is not configured');

    const { account, email } = await OAuthService.handleCallback(req, code, state);
    if (!SettingsService.get('default_account_id')) SettingsService.set('default_account_id', account.id);
    return res.redirect(`/?flash=${encodeURIComponent(`Connected ${email}`)}&flash_type=success`);
  } catch (err) {
    if (err.status === 400) {
      return res.redirect(`/?flash=${encodeURIComponent(err.message)}&flash_type=error`);
    }
    return next(err);
  }
});

module.exports = router;
