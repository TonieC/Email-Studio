'use strict';

const express = require('express');
const AccountService = require('../services/AccountService');
const OAuthService = require('../services/OAuthService');
const EmailService = require('../services/EmailService');
const SettingsService = require('../services/SettingsService');
const { requireAuth } = require('../middleware');
const { assertValid, isEmail, validateAccountName, validateSmtpHost } = require('../validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const accounts = AccountService.list();
  const configured = OAuthService.isConfigured();
  return res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      email: a.email,
      provider_id: a.provider_id,
      created_at: a.created_at,
      has_credentials: true,
    })),
    gmailConfigured: configured,
  });
});

router.get('/:id', (req, res) => {
  const account = AccountService.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  return res.json({
    account: { id: account.id, type: account.type, name: account.name, email: account.email },
  });
});

router.delete('/:id', async (req, res, next) => {
  try {
    const account = AccountService.getConfig(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.type === 'gmail') {
      try { await OAuthService.revoke(account); } catch (_) { /* continue */ }
    }
    AccountService.remove(account.id);
    if (SettingsService.get('default_account_id') === account.id) SettingsService.set('default_account_id', '');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/smtp', async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, email, host, port, encryption, username, credential } = body;
    if (!assertValid(name, validateAccountName, res)) return;
    if (!assertValid(email, (v) => (isEmail(v) ? null : 'A valid sender email is required'), res)) return;
    if (!assertValid(host, validateSmtpHost, res)) return;
    if (!assertValid(port, /^\d+$/.test(String(port || '')) ? null : 'SMTP port must be a number', res)) return;
    if (!assertValid(encryption, ['none', 'tls', 'ssl'].includes(encryption) ? null : 'Invalid encryption mode', res)) return;

    const cfg = {
      host: String(host).trim(),
      port: parseInt(port, 10),
      encryption,
      username: String(username || '').trim() || '',
      credential: String(credential || ''),
    };

    // If a password already exists for this SMTP account and none is provided, keep the old one.
    const existing = body.accountId ? AccountService.getConfig(body.accountId) : null;
    if (existing && existing.type === 'smtp' && !cfg.credential) {
      cfg.credential = existing.config.credential || '';
    }

    const account = existing
      ? AccountService.update(existing.id, { name: String(name).trim(), email: String(email).trim(), config: cfg })
      : AccountService.create({ type: 'smtp', name: String(name).trim(), email: String(email).trim(), config: cfg });

    return res.status(201).json({ account: { id: account.id, type: 'smtp', name: account.name, email: account.email } });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/verify', async (req, res, next) => {
  try {
    const account = AccountService.getConfig(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.type === 'gmail') {
      await OAuthService.getAccessToken(account);
      return res.json({ ok: true, message: 'Gmail connection is valid' });
    }
    await EmailService.verifySmtp(account.config);
    return res.json({ ok: true, message: 'SMTP connection successful' });
  } catch (err) {
    if (err.code === 'GMAIL_AUTH_EXPIRED') return res.status(401).json({ error: 'Gmail authorization expired', code: 'GMAIL_AUTH_EXPIRED' });
    return res.status(502).json({ error: err.message });
  }
});

router.post('/gmail/connect', (req, res) => {
  if (!OAuthService.isConfigured()) {
    return res.status(400).json({ error: 'Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server.' });
  }
  const url = OAuthService.buildAuthUrl(req);
  return res.json({ url });
});

module.exports = router;
