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

function usageCounts() {
  const rows = db.prepare('SELECT html FROM projects').all();
  const counts = {};
  const re = /\/api\/assets\/([0-9a-f-]{8,36})\/file/g;
  for (const row of rows) {
    let m;
    const html = String(row.html || '');
    while ((m = re.exec(html)) !== null) {
      counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
  }
  return counts;
}

function list() {
  const used = usageCounts();
  return db.prepare('SELECT id, original_name, mime, size, created_at, width, height FROM assets ORDER BY created_at DESC').all()
    .map((a) => ({
      ...a,
      url: `/api/assets/${a.id}/file`,
      usage: used[a.id] || 0,
      unused: !(used[a.id]),
      oversized: a.size > 500 * 1024 || (a.width && a.width > 1200),
    }));
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
  const dest = path.join(assetsDir, storedName);
  fs.copyFileSync(file.path, dest);
  const ImageProcessService = require('./ImageProcessService');
  const dim = ImageProcessService.readDimensions(dest);
  const now = Date.now();
  db.prepare('INSERT INTO assets (id, original_name, stored_name, mime, size, created_at, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, String(file.originalname || 'asset').slice(0, 255), storedName, file.mimetype, file.size, now, dim.width, dim.height);
  return get(id);
}

function replace(id, file) {
  const row = get(id);
  if (!row) return null;
  const ext = validateMime(file.mimetype);
  const storedName = `${id}.${ext}`;
  const dest = path.join(assetsDir, storedName);
  fs.copyFileSync(file.path, dest);
  if (row.stored_name !== storedName) {
    try { fs.unlinkSync(path.join(assetsDir, row.stored_name)); } catch (_) { /* ignore */ }
  }
  const ImageProcessService = require('./ImageProcessService');
  const dim = ImageProcessService.readDimensions(dest);
  db.prepare('UPDATE assets SET original_name = ?, stored_name = ?, mime = ?, size = ?, width = ?, height = ? WHERE id = ?')
    .run(String(file.originalname || row.original_name).slice(0, 255), storedName, file.mimetype, file.size, dim.width, dim.height, id);
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

module.exports = { list, get, create, rename, remove, readStream, replace, usageCounts };
