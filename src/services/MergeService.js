'use strict';

const { parseFields } = require('../util');

const BUILTIN = [
  { key: 'first_name', label: 'First name', fallback: 'there' },
  { key: 'last_name', label: 'Last name', fallback: '' },
  { key: 'email', label: 'Email', fallback: '' },
  { key: 'company', label: 'Company', fallback: '' },
];

function sanitizeValue(v) {
  return String(v == null ? '' : v)
    .replace(/[<>&"'`]/g, (c) => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
    }[c]))
    .replace(/javascript:/gi, '')
    .slice(0, 500);
}

function contactVars(contact) {
  const custom = parseFields(contact && contact.custom_fields);
  const out = {
    first_name: contact ? contact.first_name : '',
    last_name: contact ? contact.last_name : '',
    email: contact ? contact.email : '',
    company: contact ? contact.company : '',
  };
  for (const [k, v] of Object.entries(custom)) out[k] = v;
  return out;
}

function applyMerge(html, vars, fallbacks = {}) {
  const source = String(html || '');
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g, (_, key, fb) => {
    const raw = vars && vars[key] !== undefined && vars[key] !== null && String(vars[key]) !== ''
      ? vars[key]
      : (fb !== undefined ? fb : (fallbacks[key] != null ? fallbacks[key] : ''));
    return sanitizeValue(raw);
  });
}

function listVariables(html, css) {
  const found = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*[^}]+)?\s*\}\}/g;
  const blob = `${html || ''}\n${css || ''}`;
  let m;
  while ((m = re.exec(blob))) found.add(m[1]);
  return [...found];
}

module.exports = { BUILTIN, sanitizeValue, contactVars, applyMerge, listVariables };
