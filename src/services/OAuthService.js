'use strict';

const { google } = require('googleapis');
const crypto = require('crypto');
const config = require('../config');
const AccountService = require('./AccountService');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function getRedirectUri(req) {
  if (config.google.redirectUri) return config.google.redirectUri;
  const proto = req.secure ? 'https' : (req.get('x-forwarded-proto') || 'http');
  const host = req.get('host') || 'localhost';
  return `${proto}://${host}/oauth/callback`;
}

function clientFor(redirectUri) {
  return new google.auth.OAuth2({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    redirectUri,
  });
}

function isConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

function buildAuthUrl(req) {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const client = clientFor(getRedirectUri(req));
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

async function handleCallback(req, code, state) {
  if (!state || !req.session.oauthState || !crypto.timingSafeEqual(
    Buffer.from(String(state)), Buffer.from(String(req.session.oauthState)))) {
    const err = new Error('OAuth state validation failed');
    err.status = 400;
    throw err;
  }
  delete req.session.oauthState;

  const client = clientFor(getRedirectUri(req));
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: 'v2' });
  let userinfo = { email: tokens.email || '', id: null };
  try {
    const res = await oauth2.userinfo.get();
    userinfo = { email: res.data.email, id: res.data.id, name: res.data.name };
  } catch (_) {
    /* token email fallback */
  }

  const account = AccountService.create({
    type: 'gmail',
    name: userinfo.name ? `${userinfo.name} (Gmail)` : `${userinfo.email} (Gmail)`,
    email: userinfo.email || 'unknown',
    providerId: userinfo.id || null,
    config: {
      refreshToken: tokens.refresh_token || null,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date ? Number(tokens.expiry_date) : null,
      scope: tokens.scope || SCOPES.join(' '),
    },
  });

  return { account, email: userinfo.email };
}

/**
 * Return a valid access token for a Gmail account, refreshing + persisting when needed.
 */
async function getAccessToken(account) {
  const { config: cfg } = account;
  if (cfg.accessToken && cfg.expiryDate && cfg.expiryDate > Date.now() + 60000) {
    return cfg.accessToken;
  }
  if (!cfg.refreshToken) {
    const err = new Error('Gmail authorization expired');
    err.code = 'GMAIL_AUTH_EXPIRED';
    err.status = 401;
    throw err;
  }
  const client = new google.auth.OAuth2({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
  });
  client.setCredentials({ refresh_token: cfg.refreshToken });
  const { token } = await client.getAccessToken();
  const expiryDate = Date.now() + 3600 * 1000;
  await AccountService.update(account.id, {
    config: { ...cfg, accessToken: token, expiryDate },
  });
  return token;
}

async function revoke(account) {
  const { config: cfg } = account;
  if (cfg && cfg.refreshToken) {
    try {
      const client = new google.auth.OAuth2({
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      });
      client.setCredentials({ refresh_token: cfg.refreshToken });
      await client.revokeToken(cfg.refreshToken);
    } catch (_) {
      /* token may already be invalid */
    }
  }
}

module.exports = { isConfigured, buildAuthUrl, handleCallback, getAccessToken, revoke, getRedirectUri, SCOPES };
