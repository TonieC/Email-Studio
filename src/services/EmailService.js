'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const AccountService = require('./AccountService');
const OAuthService = require('./OAuthService');

/**
 * Provider abstraction: Gmail and SMTP both reduce to a nodemailer transporter.
 */
async function buildTransporter(account) {
  if (account.type === 'gmail') {
    if (!OAuthService.isConfigured()) {
      const err = new Error('Gmail OAuth is not configured on this server');
      err.code = 'GMAIL_NOT_CONFIGURED';
      err.status = 400;
      throw err;
    }
    const accessToken = await OAuthService.getAccessToken(account);
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: account.email,
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        refreshToken: account.config.refreshToken,
        accessToken,
        expires: account.config.expiryDate ? Math.floor(account.config.expiryDate / 1000) : undefined,
      },
    });
  }

  if (account.type === 'smtp') {
    const cfg = account.config;
    const secure = cfg.encryption === 'ssl';
    return nodemailer.createTransport({
      host: cfg.host,
      port: parseInt(cfg.port, 10) || (secure ? 465 : 587),
      secure,
      requireTLS: !secure && cfg.encryption === 'tls',
      auth: cfg.username
        ? { user: cfg.username, pass: cfg.credential || '' }
        : undefined,
    });
  }

  const err = new Error(`Unknown provider type: ${account.type}`);
  err.status = 400;
  throw err;
}

async function send({ accountId, to, cc, bcc, subject, from, html, kind = 'email' }) {
  const account = AccountService.getConfig(accountId);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }

  let transporter;
  try {
    transporter = await buildTransporter(account);
  } catch (err) {
    if (err.code === 'GMAIL_AUTH_EXPIRED') {
      err.message = 'Gmail authorization expired. Reconnect your Gmail account.';
    }
    throw err;
  }

  const fromAddr = from && String(from).trim() ? String(from).trim() : account.email;
  const mail = { from: fromAddr, to, subject };
  if (cc) mail.cc = cc;
  if (bcc) mail.bcc = bcc;
  if (html) mail.html = html;

  const info = await transporter.sendMail(mail);
  return {
    messageId: info.messageId,
    from: fromAddr,
    provider: account.type === 'gmail' ? 'gmail' : (account.config.host || 'smtp'),
  };
}

/**
 * Verify an SMTP connection without sending mail (used on save).
 */
async function verifySmtp(cfg) {
  const secure = cfg.encryption === 'ssl';
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: parseInt(cfg.port, 10) || (secure ? 465 : 587),
    secure,
    requireTLS: !secure && cfg.encryption === 'tls',
    auth: cfg.username ? { user: cfg.username, pass: cfg.credential || '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

module.exports = { send, verifySmtp };
