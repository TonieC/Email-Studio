'use strict';

const crypto = require('crypto');
const db = require('../db');
const { parseTags, parseFields, clampStr } = require('../util');
const { isEmail } = require('../validators');

function publicRow(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
    custom_fields: parseFields(row.custom_fields),
  };
}

function list({ q, tag } = {}) {
  let rows = db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC').all();
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((r) =>
      `${r.email} ${r.first_name} ${r.last_name} ${r.company}`.toLowerCase().includes(s));
  }
  if (tag) rows = rows.filter((r) => parseTags(r.tags).includes(tag));
  return rows.map(publicRow);
}

function get(id) {
  return publicRow(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

function create(data) {
  const email = String(data.email || '').trim().toLowerCase();
  if (!isEmail(email)) {
    const err = new Error('A valid email is required');
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`INSERT INTO contacts (id, email, first_name, last_name, company, tags, custom_fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      email,
      clampStr(data.first_name, 80),
      clampStr(data.last_name, 80),
      clampStr(data.company, 120),
      JSON.stringify(parseTags(data.tags)),
      JSON.stringify(parseFields(data.custom_fields)),
      now,
      now
    );
  return get(id);
}

function update(id, data) {
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) return null;
  if (data.email !== undefined && !isEmail(data.email)) {
    const err = new Error('A valid email is required');
    err.status = 400;
    throw err;
  }
  db.prepare(`UPDATE contacts SET
      email = COALESCE(?, email),
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      company = COALESCE(?, company),
      tags = COALESCE(?, tags),
      custom_fields = COALESCE(?, custom_fields),
      updated_at = ?
    WHERE id = ?`)
    .run(
      data.email === undefined ? null : String(data.email).trim().toLowerCase(),
      data.first_name === undefined ? null : clampStr(data.first_name, 80),
      data.last_name === undefined ? null : clampStr(data.last_name, 80),
      data.company === undefined ? null : clampStr(data.company, 120),
      data.tags === undefined ? null : JSON.stringify(parseTags(data.tags)),
      data.custom_fields === undefined ? null : JSON.stringify(parseFields(data.custom_fields)),
      Date.now(),
      id
    );
  return get(id);
}

function remove(id) {
  return db.prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0;
}

function importCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { imported: 0, errors: ['Empty CSV'] };
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idx = (name) => header.indexOf(name);
  const errors = [];
  let imported = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = cols[idx('email')] || cols[0];
    try {
      const custom = {};
      header.forEach((h, n) => {
        if (!['email', 'first_name', 'last_name', 'company', 'tags'].includes(h) && cols[n]) custom[h] = cols[n];
      });
      create({
        email,
        first_name: cols[idx('first_name')] || '',
        last_name: cols[idx('last_name')] || '',
        company: cols[idx('company')] || '',
        tags: (cols[idx('tags')] || '').split('|').filter(Boolean),
        custom_fields: custom,
      });
      imported += 1;
    } catch (err) {
      errors.push(`Line ${i + 1}: ${err.message}`);
    }
  }
  return { imported, errors };
}

function exportCsv() {
  const rows = list();
  const lines = ['email,first_name,last_name,company,tags'];
  for (const r of rows) {
    lines.push([r.email, r.first_name, r.last_name, r.company, (r.tags || []).join('|')]
      .map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

module.exports = { list, get, create, update, remove, importCsv, exportCsv };
