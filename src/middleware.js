'use strict';

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  next();
}

function csrfProtect(req, res, next) {
  if (SAFE_METHODS.includes(req.method)) return next();
  const token = req.get('x-csrf-token');
  const expected = req.session.csrf;
  const ok = token && expected &&
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(expected));
  if (!ok) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

function apiLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });
}

function authLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' },
    skipSuccessfulRequests: true,
  });
}

function sendLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Send rate limit reached, please try again later' },
  });
}

function notFound(req, res) {
  return res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Internal server error' : err.message;
  if (res.headersSent) return;
  return res.status(status).json({ error: message });
}

module.exports = {
  requireAuth,
  ensureCsrfToken,
  csrfProtect,
  apiLimiter,
  authLimiter,
  sendLimiter,
  notFound,
  errorHandler,
};
