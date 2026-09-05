'use strict';

const crypto = require('crypto');
const db = require('../db');
const { parseTags, clampStr } = require('../util');
const VersionService = require('./VersionService');

function newId() {
  return crypto.randomUUID();
}

function parseProject(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
    favorite: !!row.favorite,
    archived: !!row.archived,
    trashed: !!row.trashed,
  };
}

function list({ q, folderId, tag, favorite, archived, trashed, sort } = {}) {
  let rows = db.prepare(
    `SELECT id, name, folder_id, tags, favorite, archived, trashed, last_opened_at,
            subject, preheader, created_at, updated_at
     FROM projects`
  ).all();
  if (trashed === true) rows = rows.filter((r) => r.trashed);
  else if (trashed === 'all') { /* keep */ }
  else rows = rows.filter((r) => !r.trashed);

  if (archived === true) rows = rows.filter((r) => r.archived);
  else if (archived === 'all') { /* keep */ }
  else rows = rows.filter((r) => !r.archived);

  if (favorite) rows = rows.filter((r) => r.favorite);
  if (folderId === 'none') rows = rows.filter((r) => !r.folder_id);
  else if (folderId) rows = rows.filter((r) => r.folder_id === folderId);
  if (tag) rows = rows.filter((r) => parseTags(r.tags).includes(tag));
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((r) => `${r.name} ${r.subject || ''} ${(r.tags || '')}`.toLowerCase().includes(s));
  }
  const sortKey = sort || 'updated';
  rows.sort((a, b) => {
    if (sortKey === 'name') return String(a.name).localeCompare(String(b.name));
    if (sortKey === 'created') return (b.created_at || 0) - (a.created_at || 0);
    if (sortKey === 'opened') return (b.last_opened_at || 0) - (a.last_opened_at || 0);
    return (b.updated_at || 0) - (a.updated_at || 0);
  });
  return rows.map(parseProject);
}

function get(id) {
  return parseProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
}

function getPublic(id) {
  const row = get(id);
  if (!row) return null;
  return row;
}

function create(data = {}) {
  const id = newId();
  const now = Date.now();
  db.prepare(`INSERT INTO projects
    (id, name, html, css, created_at, updated_at, folder_id, tags, favorite, archived, trashed,
     subject, preheader, from_name, reply_to, visual_json, to_addr, cc_addr, bcc_addr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      clampStr(data.name || 'Untitled email', 120),
      data.html || '',
      data.css || '',
      now,
      now,
      data.folderId || null,
      JSON.stringify(parseTags(data.tags)),
      clampStr(data.subject || '', 500),
      clampStr(data.preheader || '', 300),
      clampStr(data.from_name || '', 120),
      clampStr(data.reply_to || '', 200),
      data.visual_json || '',
      clampStr(data.to_addr || '', 500),
      clampStr(data.cc_addr || '', 500),
      clampStr(data.bcc_addr || '', 500)
    );
  const project = get(id);
  VersionService.snapshot(project, 'Created');
  return project;
}

function update(id, fields) {
  const existing = get(id);
  if (!existing) return null;
  const now = Date.now();
  db.prepare(`UPDATE projects SET
      name = COALESCE(?, name),
      html = COALESCE(?, html),
      css = COALESCE(?, css),
      folder_id = CASE WHEN ? = 1 THEN ? ELSE folder_id END,
      tags = COALESCE(?, tags),
      favorite = COALESCE(?, favorite),
      archived = COALESCE(?, archived),
      trashed = COALESCE(?, trashed),
      subject = COALESCE(?, subject),
      preheader = COALESCE(?, preheader),
      from_name = COALESCE(?, from_name),
      reply_to = COALESCE(?, reply_to),
      visual_json = COALESCE(?, visual_json),
      crash_draft = COALESCE(?, crash_draft),
      to_addr = COALESCE(?, to_addr),
      cc_addr = COALESCE(?, cc_addr),
      bcc_addr = COALESCE(?, bcc_addr),
      updated_at = ?
    WHERE id = ?`)
    .run(
      fields.name === undefined ? null : clampStr(fields.name, 120),
      fields.html === undefined ? null : String(fields.html),
      fields.css === undefined ? null : String(fields.css),
      fields.folderId === undefined ? 0 : 1,
      fields.folderId === undefined ? null : fields.folderId,
      fields.tags === undefined ? null : JSON.stringify(parseTags(fields.tags)),
      fields.favorite === undefined ? null : (fields.favorite ? 1 : 0),
      fields.archived === undefined ? null : (fields.archived ? 1 : 0),
      fields.trashed === undefined ? null : (fields.trashed ? 1 : 0),
      fields.subject === undefined ? null : clampStr(fields.subject, 500),
      fields.preheader === undefined ? null : clampStr(fields.preheader, 300),
      fields.from_name === undefined ? null : clampStr(fields.from_name, 120),
      fields.reply_to === undefined ? null : clampStr(fields.reply_to, 200),
      fields.visual_json === undefined ? null : String(fields.visual_json),
      fields.crash_draft === undefined ? null : fields.crash_draft,
      fields.to_addr === undefined ? null : clampStr(fields.to_addr, 500),
      fields.cc_addr === undefined ? null : clampStr(fields.cc_addr, 500),
      fields.bcc_addr === undefined ? null : clampStr(fields.bcc_addr, 500),
      now,
      id
    );
  return get(id);
}

function touchOpened(id) {
  db.prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(Date.now(), id);
}

function remove(id) {
  db.prepare('DELETE FROM versions WHERE project_id = ?').run(id);
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

function duplicate(id) {
  const existing = get(id);
  if (!existing) return null;
  return create({
    name: existing.name + ' (copy)',
    html: existing.html,
    css: existing.css,
    tags: existing.tags,
    folderId: existing.folder_id,
    subject: existing.subject,
    preheader: existing.preheader,
    from_name: existing.from_name,
    reply_to: existing.reply_to,
    visual_json: existing.visual_json,
    to_addr: existing.to_addr,
    cc_addr: existing.cc_addr,
    bcc_addr: existing.bcc_addr,
  });
}

function bulk(ids, action, extra = {}) {
  const listIds = Array.isArray(ids) ? ids.slice(0, 200) : [];
  const results = [];
  for (const id of listIds) {
    if (action === 'delete') results.push(remove(id));
    else if (action === 'trash') results.push(!!update(id, { trashed: true }));
    else if (action === 'restore') results.push(!!update(id, { trashed: false, archived: false }));
    else if (action === 'archive') results.push(!!update(id, { archived: true }));
    else if (action === 'unarchive') results.push(!!update(id, { archived: false }));
    else if (action === 'favorite') results.push(!!update(id, { favorite: true }));
    else if (action === 'unfavorite') results.push(!!update(id, { favorite: false }));
    else if (action === 'move') results.push(!!update(id, { folderId: extra.folderId || null }));
    else if (action === 'tag') results.push(!!update(id, { tags: extra.tags }));
    else if (action === 'duplicate') results.push(duplicate(id));
  }
  return results;
}

function searchContent(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s || s.length < 2) return [];
  const rows = db.prepare('SELECT id, name, html, css FROM projects WHERE trashed = 0').all();
  const out = [];
  for (const row of rows) {
    const html = String(row.html || '');
    const css = String(row.css || '');
    const blob = html + '\n' + css;
    const idx = blob.toLowerCase().indexOf(s);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    out.push({
      id: row.id,
      name: row.name,
      snippet: blob.slice(start, start + 120).replace(/\s+/g, ' '),
    });
  }
  return out.slice(0, 50);
}

module.exports = {
  list, get, getPublic, create, update, remove, duplicate, bulk, touchOpened, searchContent, newId, parseProject,
};
