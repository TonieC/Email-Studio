'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../config');

function hasMagick() {
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function readDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      if (buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker === 0xc0 || marker === 0xc2) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
  } catch (_) {
    /* ignore */
  }
  return { width: null, height: null };
}

function processFile(storedPath, { maxWidth, format, quality } = {}) {
  if (!hasMagick()) {
    return { processed: false, reason: 'ImageMagick not available; original file kept' };
  }
  const abs = path.resolve(storedPath);
  const root = path.resolve(path.join(config.dataDir, 'assets'));
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    const err = new Error('Invalid asset path');
    err.status = 400;
    throw err;
  }
  const args = [abs];
  if (maxWidth) args.push('-resize', `${parseInt(maxWidth, 10)}>`);
  if (quality) args.push('-quality', String(parseInt(quality, 10) || 80));
  const dest = format ? abs.replace(/\.[^.]+$/, '.' + format.replace(/[^a-z0-9]/gi, '')) : abs;
  args.push(dest);
  try {
    execFileSync('convert', args, { stdio: 'ignore', timeout: 15000 });
    return { processed: true, path: dest };
  } catch (err) {
    return { processed: false, reason: err.message };
  }
}

module.exports = { readDimensions, processFile, hasMagick };
