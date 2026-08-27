'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');

function dirStats(dir) {
  if (!fs.existsSync(dir)) return { path: dir, files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = dirStats(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      try { bytes += fs.statSync(full).size; } catch (_) { /* ignore */ }
    }
  }
  return { path: dir, files, bytes };
}

function usage() {
  const sizes = db.prepare('SELECT SUM(LENGTH(html) + LENGTH(css)) AS n FROM projects').get().n || 0;
  return {
    databaseBytes: sizes,
    databaseFileBytes: fs.existsSync(config.dbPath) ? fs.statSync(config.dbPath).size : 0,
    assets: dirStats(path.join(config.dataDir, 'assets')),
    dataDir: config.dataDir,
  };
}

module.exports = { usage, dirStats };
