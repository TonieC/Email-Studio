'use strict';

const cheerio = require('cheerio');

const DANGEROUS_TAGS = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'select', 'textarea', 'link', 'base', 'audio',
  'video', 'canvas', 'svg', 'math', 'template', 'portal', 'dialog', 'meta',
];

const DANGEROUS_SCHEMES = /^\s*(javascript|vbscript|data:text\/html|data:image\/svg|filesystem):/i;

function extractCss(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false });
  const parts = [];
  $('style').each((_, el) => {
    parts.push($(el).text());
  });
  $('style').remove();
  return { $, css: parts.join('\n') };
}

function sanitizeImported($) {
  const warnings = [];
  let removed = 0;
  DANGEROUS_TAGS.forEach((tag) => {
    const els = $(tag);
    if (els.length) {
      removed += els.length;
      els.remove();
    }
  });
  $('*').each((_, el) => {
    const attrs = el.attribs || {};
    for (const name of Object.keys(attrs)) {
      if (/^on/i.test(name)) {
        delete attrs[name];
        removed += 1;
      }
    }
  });
  $('[href],[src],[action],[background],[xlink\\:href]').each((_, el) => {
    for (const attr of ['href', 'src', 'action', 'background', 'xlink:href']) {
      const val = $(el).attr(attr);
      if (val && DANGEROUS_SCHEMES.test(val)) {
        $(el).removeAttr(attr);
        removed += 1;
      }
    }
  });
  if ($('svg').length) {
    $('svg').remove();
    warnings.push('SVG markup was rejected during import.');
  }
  if (removed) warnings.push(`Removed ${removed} unsafe element(s), attribute(s) or URL(s).`);
  return warnings;
}

function importHtml(raw) {
  const text = String(raw || '');
  if (!text.trim()) {
    const err = new Error('HTML is required');
    err.status = 400;
    throw err;
  }
  if (/<svg[\s>]/i.test(text) && /<script/i.test(text)) {
    const err = new Error('Malicious SVG content was rejected');
    err.status = 400;
    throw err;
  }
  const { $, css } = extractCss(text);
  const warnings = sanitizeImported($);
  let html;
  const $body = $('body');
  if ($body.length) html = $body.html() || '';
  else html = $.root().html() || '';
  html = String(html).trim();
  return { html, css: css.trim(), warnings };
}

module.exports = { importHtml };
