'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let key = Buffer.alloc(0);

function loadKey() {
  if (key.length > 0) return key;
  const envKey = config.encryptionKey;
  if (envKey) {
    key = Buffer.from(envKey, 'hex');
    if (key.length !== 32) {
      // Accept plain passphrases by hashing them into a 32-byte key.
      key = crypto.createHash('sha256').update(envKey).digest();
    }
    return key;
  }
  const keyPath = path.join(config.dataDir, 'keys', 'encryption.key');
  if (fs.existsSync(keyPath)) {
    key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
  } else {
    key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  }
  return key;
}

/**
 * Encrypt a UTF-8 string. Returns a base64 payload: iv(12).tag(16).ciphertext.
 */
function encrypt(plainText) {
  const k = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a payload produced by encrypt(). Returns null on failure.
 */
function decrypt(payload) {
  try {
    const k = loadKey();
    const raw = Buffer.from(payload, 'base64');
    if (raw.length < 12 + 16 + 1) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { encrypt, decrypt, randomToken, loadKey };
