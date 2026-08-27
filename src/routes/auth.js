'use strict';

const express = require('express');
const AuthService = require('../services/AuthService');
const { authLimiter, requireAuth } = require('../middleware');
const { assertValid } = require('../validators');

const router = express.Router();

router.get('/bootstrap', (req, res) => {
  const needsSetup = AuthService.needsSetup();
  return res.json({
    needsSetup,
    user: req.session.userId ? AuthService.getUserById(req.session.userId) : null,
    csrf: req.session.csrf,
  });
});

router.post('/setup', authLimiter(), (req, res, next) => {
  try {
    const { username, password, confirm } = req.body || {};
    const uname = String(username || '').trim();
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(uname)) {
      return res.status(400).json({ error: 'Username must be 3-40 characters (letters, numbers, . _ -)' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    const user = AuthService.setup(uname, password);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.csrf = require('crypto').randomBytes(24).toString('hex');
      return res.json({ user, csrf: req.session.csrf });
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', authLimiter(), (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = AuthService.verify(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.csrf = require('crypto').randomBytes(24).toString('hex');
      return res.json({ user, csrf: req.session.csrf });
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('emailstudio.sid');
    return res.json({ ok: true });
  });
});

router.post('/password', requireAuth, (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirm } = req.body || {};
    if (newPassword !== confirm) return res.status(400).json({ error: 'Passwords do not match' });
    AuthService.changePassword(req.session.userId, oldPassword, newPassword);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
