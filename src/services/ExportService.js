'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const AssetService = require('./AssetService');
const { zip } = require('./zip');

/**
 * Build a standalone HTML file for a project: body HTML with CSS embedded in a <style> tag.
 */
function buildHtml(project) {
  const css = (project.css || '').trim() ? `<style>${project.css}</style>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeTitle(project.name)}</title>
${css}
</head>
<body>
${project.html || ''}
</body>
</html>`;
}

/**
 * Collect the assets referenced by a project's HTML as { name, buffer } entries.
 * Falls back to all library assets when none can be resolved from the markup.
 */
function referencedAssets(html) {
  const used = new Set();
  const re = /\/api\/assets\/([0-9a-f-]{8,36})\/file/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) used.add(m[1]);

  const ids = used.size ? [...used] : AssetService.list().map((a) => a.id);
  const out = [];
  for (const id of ids) {
    const row = AssetService.get(id);
    if (!row) continue;
    const filePath = path.join(config.dataDir, 'assets', row.stored_name);
    if (!fs.existsSync(filePath)) continue;
    let name = String(row.original_name || 'asset').replace(/[^\w.\-]+/gi, '_');
    if (!name) name = 'asset';
    out.push({ name, buffer: fs.readFileSync(filePath) });
  }
  return out;
}

/**
 * Package a project as a zip archive: index.html, project.json and referenced assets.
 */
function buildZip(project) {
  const entries = [
    { name: 'index.html', data: buildHtml(project) },
    {
      name: 'project.json',
      data: JSON.stringify({
        name: project.name,
        html: project.html || '',
        css: project.css || '',
        updatedAt: project.updated_at,
      }, null, 2),
    },
  ];
  for (const asset of referencedAssets(project.html)) {
    entries.push({ name: `assets/${asset.name}`, data: asset.buffer });
  }
  return zip(entries);
}

function safeBaseName(name) {
  return String(name || 'project').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project';
}

function escapeTitle(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

module.exports = { buildHtml, buildZip, safeBaseName, referencedAssets };
