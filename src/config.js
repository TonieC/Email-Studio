'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));

const subDirs = ['projects', 'accounts', 'assets', 'templates', 'history', 'settings', 'keys'];
for (const d of subDirs) {
  fs.mkdirSync(path.join(dataDir, d), { recursive: true });
}

function bool(v, def) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const config = {
  rootDir,
  dataDir,
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'email-studio-dev-secret-change-me',
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  appName: process.env.APP_NAME || 'Email Studio',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },
  smtpTestPort: parseInt(process.env.SMTP_TEST_PORT || '2525', 10),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10),
  allowedAssetTypes: (process.env.ASSET_MIME_TYPES ||
    'image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon'
  ).split(',').map((s) => s.trim()).filter(Boolean),
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  dbPath: path.join(dataDir, 'app.db'),
  convertOptions: {
    inlineAssets: bool(process.env.CONVERT_INLINE_ASSETS, false),
  },
};

module.exports = config;
