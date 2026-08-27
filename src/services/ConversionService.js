'use strict';

const cheerio = require('cheerio');
const juice = require('juice');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const AssetService = require('./AssetService');

const DOCTYPE = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

const JUICE_OPTIONS = {
  applyStyleTags: true,
  removeStyleTags: true,
  preserveMediaQueries: true,
  preserveImportant: true,
  preserveFontFaces: true,
  preserveKeyFrames: true,
  applyWidthAttributes: true,
  applyHeightAttributes: true,
  applyAttributesTableElements: true,
  inlinePseudoElements: false,
  xmlMode: false,
};

const DANGEROUS_TAGS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base', 'audio', 'video',
  'canvas', 'svg', 'math', 'template', 'portal', 'dialog'];
const DANGEROUS_META = ['refresh'];

function parseWidth(style) {
  const m = style.match(/(?:^|;)\s*width\s*:\s*(\d+)(px|%)/i);
  return m ? { value: parseInt(m[1], 10), unit: m[2] } : null;
}

function buildDocument(html, css) {
  let $ = cheerio.load(html || '', { decodeEntities: false });
  if ($('html').length === 0) {
    $ = cheerio.load(
      `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head><body>${html || ''}</body></html>`,
      { decodeEntities: false }
    );
  }
  if ($('body').length === 0) {
    $('html').append('<body></body>');
  }
  if ($('head').length === 0) {
    $('html').prepend('<head></head>');
  }
  if (css && String(css).trim()) {
    $('head').append(`<style type="text/css">${css}</style>`);
  }
  return $;
}

function sanitize($) {
  const stats = { removedTags: 0, removedHandlers: 0, removedUrls: 0 };
  DANGEROUS_TAGS.forEach((tag) => {
    const els = $(tag);
    if (els.length) {
      stats.removedTags += els.length;
      els.remove();
    }
  });
  // Remove unsafe meta tags
  $('meta').each((_, el) => {
    const heq = String($(el).attr('http-equiv') || '').toLowerCase();
    if (DANGEROUS_META.includes(heq)) $(el).remove();
  });
  // Remove event handlers
  $('*').each((_, el) => {
    const attrs = el.attribs;
    for (const name of Object.keys(attrs)) {
      if (/^on/i.test(name)) {
        delete attrs[name];
        stats.removedHandlers++;
      }
    }
  });
  // Remove dangerous URL schemes
  $('[href],[src],[action],[background],[style]').each((_, el) => {
    for (const attr of ['href', 'src', 'action', 'background']) {
      const val = $(el).attr(attr);
      if (val && /^\s*(javascript|vbscript|data:text\/html|filesystem):/i.test(val)) {
        $(el).removeAttr(attr);
        stats.removedUrls++;
      }
    }
    const style = $(el).attr('style');
    if (style) {
      const cleaned = style.replace(/url\s*\(\s*(['"]?)\s*(javascript|vbscript|data:text\/html)[^)]*\)/gi, 'none');
      if (cleaned !== style) {
        $(el).attr('style', cleaned);
        stats.removedUrls++;
      }
    }
  });
  return stats;
}

function normalizeTables($) {
  $('table').each((_, el) => {
    const $t = $(el);
    if (!$t.attr('border')) $t.attr('border', '0');
    if (!$t.attr('cellpadding')) $t.attr('cellpadding', '0');
    if (!$t.attr('cellspacing')) $t.attr('cellspacing', '0');
    if (!$t.attr('role')) $t.attr('role', 'presentation');
  });
}

function convertFlexToTable($) {
  const styleAttrs = $('div,section,main,header,footer,nav,article,aside,ul');
  styleAttrs.each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    if (!/\bdisplay\s*:\s*(inline-)?flex\b/i.test(style)) return;
    const children = $el.children();
    if (children.length === 0 || children.length > 6) return;
    let nested = false;
    children.each((_, c) => {
      const cs = $(c).attr('style') || '';
      if (/\bdisplay\s*:\s*(inline-)?flex\b/i.test(cs)) nested = true;
    });
    if (nested) return;
    const justify = (style.match(/justify-content\s*:\s*(\w+)/i) || [])[1];
    const $tr = $('<tr/>');
    children.each((_, c) => {
      const $c = $(c);
      const cStyle = $c.attr('style') || '';
      const w = parseWidth(cStyle);
      const $td = $('<td/>');
      if (w) $td.attr('width', `${w.value}${w.unit}`).attr('style', `width:${w.value}${w.unit};`);
      const align = (cStyle.match(/(?:text-)?align\s*:\s*(\w+)/i) || [])[1];
      if (['left', 'center', 'right'].includes(align)) $td.attr('align', align);
      const vAlign = (cStyle.match(/vertical-align\s*:\s*(\w+)/i) || [])[1];
      if (vAlign) $td.attr('valign', vAlign);
      $td.append($c.contents());
      $tr.append($td);
    });
    if (justify === 'space-between' || justify === 'space-around') {
      const n = children.length;
      $tr.children('td').each((_, td) => {
        if (!$(td).attr('width')) $(td).attr('width', Math.floor(100 / n)).css('width', `${Math.floor(100 / n)}%`);
      });
    }
    const $table = $('<table/>').attr({ role: 'presentation', border: '0', cellpadding: '0', cellspacing: '0', width: '100%' });
    const tAlign = (style.match(/(?:^|;)\s*(?:text-)?align\s*:\s*(\w+)/i) || [])[1];
    if (justify === 'center' || (tAlign && ['center'].includes(tAlign))) $table.attr('align', 'center');
    $table.append($tr);
    $el.replaceWith($table);
  });
}

function inlineLocalAssets($) {
  let inlined = 0;
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    let m = src.match(/^\/api\/assets\/([0-9a-f-]+)\/file/i);
    if (!m) m = src.match(/\/api\/assets\/([0-9a-f-]+)\/file(?:\?.*)?$/i);
    if (!m) return;
    const row = AssetService.get(m[1]);
    if (!row) return;
    const filePath = path.join(config.dataDir, 'assets', row.stored_name);
    if (!fs.existsSync(filePath)) return;
    const b64 = fs.readFileSync(filePath).toString('base64');
    $(el).attr('src', `data:${row.mime};base64,${b64}`);
    inlined++;
  });
  return inlined;
}

function postProcess($) {
  // Body attributes for maximum client support
  const $body = $('body');
  const bodyStyle = $body.attr('style') || '';
  const bg = (bodyStyle.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/i) || [])[1];
  const color = (bodyStyle.match(/color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)/i) || [])[1];
  if (bg && !$body.attr('bgcolor')) $body.attr('bgcolor', bg);
  if (color && !$body.attr('text')) $body.attr('text', color);
  if (!$body.attr('margin')) {
    const margin = bodyStyle.match(/margin\s*:\s*([^;]+)/i);
    if (margin) {
      const parts = margin[1].trim().split(/\s+/);
      if (parts[0]) $body.attr('marginwidth', parts[0].replace(/px/, ''));
      if (parts[0]) $body.attr('marginheight', parts[0].replace(/px/, ''));
    }
  }
  $body.css('width', '100%');

  // Images: alt text + dimension attributes from styles
  $('img').each((_, el) => {
    const $img = $(el);
    if (!$img.attr('alt')) $img.attr('alt', '');
    const style = $img.attr('style') || '';
    const w = (style.match(/width\s*:\s*(\d+(?:\.\d+)?)px/i) || [])[1];
    const h = (style.match(/height\s*:\s*(\d+(?:\.\d+)?)px/i) || [])[1];
    if (w && !$img.attr('width')) $img.attr('width', Math.round(parseFloat(w)));
    if (h && !$img.attr('height')) $img.attr('height', Math.round(parseFloat(h)));
  });

  // Ensure every table carries email attributes
  normalizeTables($);

  // Add email-client reset + responsive helpers
  const resetCss = [
    '.ExternalClass{width:100%}',
    'body{margin:0;padding:0;-webkit-text-size-adjust:100%}',
    'img{max-width:100%;height:auto;border:0}',
  ].join('');
  let styleTag = `  <style type="text/css">\n${resetCss}\n  </style>\n`;
  const preserved = $('style[data-embedded]').first();
  if (preserved.length) {
    preserved.before(styleTag);
  } else {
    $('head').append(styleTag.trim());
  }

  // Sanity: drop any leftover empty <style> tags that juice missed
  $('style').each((_, el) => {
    if (!$(el).text().trim() && !$(el).attr('data-embedded')) $(el).remove();
  });

  // Make sure charset meta exists
  if (!$('meta[http-equiv="Content-Type"]').length && !$('meta[charset]').length) {
    $('head').prepend('<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />');
  }

  return { bgcolor: bg || null };
}

function convert({ html, css, options = {} }) {
  let warnings = [];
  let $ = buildDocument(html, css);

  const sanitizeStats = sanitize($);
  if (sanitizeStats.removedTags > 0) {
    warnings.push(`Removed ${sanitizeStats.removedTags} unsafe element(s) (scripts, forms, iframes, etc.)`);
  }
  if (sanitizeStats.removedHandlers > 0) {
    warnings.push(`Removed ${sanitizeStats.removedHandlers} inline event handler(s)`);
  }
  if (sanitizeStats.removedUrls > 0) {
    warnings.push(`Removed ${sanitizeStats.removedUrls} unsafe URL(s)`);
  }

  const rawHtml = $.html();
  let inlinedHtml;
  try {
    inlinedHtml = juice(rawHtml, JUICE_OPTIONS);
  } catch (err) {
    const e = new Error(`CSS inlining failed: ${err.message}`);
    e.status = 422;
    throw e;
  }

  $ = cheerio.load(inlinedHtml, { decodeEntities: false });

  convertFlexToTable($);

  const inlineAssetCount = options.inlineAssets ? inlineLocalAssets($) : 0;
  if (inlineAssetCount > 0) warnings.push(`Inlined ${inlineAssetCount} local image(s) as data URIs`);

  postProcess($);

  let out = $.html();
  if (!/^<!DOCTYPE/i.test(out.trim())) out = DOCTYPE + '\n' + out.trim();
  out = out.replace(/\n{3,}/g, '\n\n');

  // Inspect output for retained <style> (media queries, keyframes, font-faces)
  const preserved = cheerio.load(out, { decodeEntities: false });
  let hasMediaQueries = false;
  let hasFlexOrGrid = false;
  preserved('style').each((_, el) => {
    const text = preserved(el).text();
    if (/@media/i.test(text)) hasMediaQueries = true;
    if (/(?:^|[;}])\s*display\s*:\s*(flex|inline-flex|grid|inline-grid)/i.test(text)) hasFlexOrGrid = true;
  });

  const stats = {
    inlineStyles: (out.match(/style\s*=/gi) || []).length,
    images: preserved('img').length,
    tables: preserved('table').length,
    mediaQueries: hasMediaQueries,
    flexOrGrid: hasFlexOrGrid,
    sizeBytes: Buffer.byteLength(out, 'utf8'),
  };

  return { html: out, stats, warnings };
}

module.exports = { convert, DOCTYPE };
