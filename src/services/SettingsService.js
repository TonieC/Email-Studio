'use strict';

const db = require('../db');
const crypto = require('crypto');

function get(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch (_) {
    return row.value;
  }
}

function set(key, value) {
  const stored = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, stored);
}

function getPublicSettings() {
  return {
    appName: String(get('app_name', 'Email Studio')),
    publicBaseUrl: get('public_base_url', ''),
    inlineAssets: !!get('inline_assets', false),
  };
}

function getSendDefaults() {
  return {
    fromAddress: get('from_address', ''),
    defaultAccountId: get('default_account_id', ''),
  };
}

function all() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return rows;
}

function generateDefaultAccountKey() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM settings WHERE key LIKE \'default_account:%\'').get();
  return 'default_account:' + (existing.n + 1);
}

module.exports = { get, set, getPublicSettings, getSendDefaults, all, generateDefaultAccountKey };
