'use strict';

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function isValidEmailList(v) {
  if (v === undefined || v === null || v === '') return true;
  const parts = String(v).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(isEmail);
}

function validateProjectName(name) {
  const s = String(name || '').trim();
  if (!s) return 'Project name is required';
  if (s.length > 120) return 'Project name must be at most 120 characters';
  return null;
}

function validateAccountName(name) {
  const s = String(name || '').trim();
  if (!s) return 'Account name is required';
  if (s.length > 80) return 'Account name must be at most 80 characters';
  return null;
}

/**
 * Validate an SMTP host. This is an admin-gated action, but we still guard
 * against obvious SSRF targets (cloud metadata endpoints, link-local, the
 * wildcard address) to keep the app from being used as a scan/proxy host.
 */
function validateSmtpHost(v) {
  const host = String(v || '').trim();
  if (!host) return 'SMTP host is required';
  if (host.length > 253) return 'SMTP host is too long';

  const lower = host.toLowerCase().replace(/\.$/, '');
  const blockedNames = ['169.254.169.254', 'metadata.google.internal', 'metadata'];
  if (blockedNames.includes(lower) || /^metadata\./.test(lower)) {
    return 'This SMTP host is not allowed';
  }

  // Bare IPv4 literals: block 0.0.0.0, link-local (169.254.0.0/16) and broadcast.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some((p) => p > 255)) return 'Invalid SMTP host';
    const [a, b] = parts;
    if (a === 0 || (a === 169 && b === 254) || host === '255.255.255.255') {
      return 'This SMTP host is not allowed';
    }
  }

  return null;
}

function assertValid(field, check, res) {
  let err;
  if (typeof check === 'function') {
    err = check(field);
  } else if (typeof check === 'string') {
    // String checks are "required field" messages.
    err = field === undefined || field === null || String(field).trim() === '' ? check : null;
  } else {
    err = null;
  }
  if (err) {
    res.status(400).json({ error: err });
    return false;
  }
  return true;
}

module.exports = { isEmail, isValidEmailList, validateProjectName, validateAccountName, validateSmtpHost, assertValid };
