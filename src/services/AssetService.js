'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');

const assetsDir = path.join(config.dataDir, 'assets');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

function list() {
  return db.prepare('SELECT id, original_name, mime, size, created_at FROM assets ORDER BY created_at DESC').all()
    .map((a) => ({ ...a, url: `/api/assets/${a.id}/file` }));
}

function get(id) {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  return row || null;
}

function validateMime(mime) {
  if (!config.allowedAssetTypes.includes(mime)) {
    const err = new Error(`File type "${mime || 'unknown'}" is not allowed`);
    err.status = 415;
    throw err;
  }
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    const err = new Error('Unsupported image type');
    err.status = 415;
    throw err;
  }
  return ext;
}

function create(file) {
  const ext = validateMime(file.mimetype);
  const id = crypto.randomUUID();
  const storedName = `${id}.${ext}`;
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.copyFileSync(file.path, path.join(assetsDir, storedName));
  const now = Date.now();
  db.prepare('INSERT INTO assets (id, original_name, stored_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, String(file.originalname || 'asset').slice(0, 255), storedName, file.mimetype, file.size, now);
  return get(id);
}

function rename(id, name) {
  const row = get(id);
  if (!row) return null;
  db.prepare('UPDATE assets SET original_name = ? WHERE id = ?').run(String(name || '').slice(0, 255), id);
  return get(id);
}

function remove(id) {
  const row = get(id);
  if (!row) return null;
  const filePath = path.join(assetsDir, row.stored_name);
  try {
    fs.unlinkSync(filePath);
  } catch (_) {
    /* missing file is fine */
  }
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return true;
}

function readStream(id) {
  const row = get(id);
  if (!row) return null;
  const filePath = path.join(assetsDir, row.stored_name);
  if (!fs.existsSync(filePath)) return null;
  return { row, stream: fs.createReadStream(filePath) };
}

module.exports = { list, get, create, rename, remove, readStream };
