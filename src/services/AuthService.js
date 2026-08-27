'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db');

const BCRYPT_ROUNDS = 12;

function needsSetup() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  return row.n === 0;
}

function setup(username, password) {
  if (!needsSetup()) {
    const err = new Error('Setup has already been completed');
    err.status = 409;
    throw err;
  }
  const hash = bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
  const now = Date.now();
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, hash, now);
  return { id: info.lastInsertRowid, username };
}

function verify(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user) return null;
  const ok = bcrypt.compareSync(String(password || ''), user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

function getUserById(id) {
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);
  return user || null;
}

function changePassword(userId, oldPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const ok = bcrypt.compareSync(String(oldPassword || ''), user.password_hash);
  if (!ok) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });
  if (String(newPassword || '').length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters'), { status: 400 });
  }
  const hash = bcrypt.hashSync(String(newPassword), BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return true;
}

module.exports = { needsSetup, setup, verify, getUserById, changePassword };
