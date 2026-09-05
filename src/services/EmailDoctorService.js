'use strict';

const cheerio = require('cheerio');
const LinkService = require('./LinkService');

const GMAIL_CLIP = 102 * 1024;

function relativeLuminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return null;
  const nums = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = nums.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  if (L1 == null || L2 == null) return null;
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function issue(level, code, message, detail, loc, fix) {
  return { level, code, message, detail: detail || null, location: loc || null, fix: fix || null };
}

function analyze(html, css) {
  const source = String(html || '');
  const $ = cheerio.load(source, { decodeEntities: false });
  const findings = [];
  const size = Buffer.byteLength(source, 'utf8');

  if (!/^<!DOCTYPE/i.test(source.trim())) {
    findings.push(issue('warning', 'doctype', 'Missing HTML doctype', 'Email clients expect an XHTML/HTML doctype.', 'document', { type: 'doctype' }));
  } else {
    findings.push(issue('ok', 'doctype', 'Document has a doctype'));
  }

  if ($('script').length) {
    findings.push(issue('error', 'script', 'JavaScript is present', 'Scripts are stripped or blocked in email clients.', 'script'));
  } else {
    findings.push(issue('ok', 'script', 'No JavaScript detected'));
  }

  $('*').each((_, el) => {
    const attrs = el.attribs || {};
    for (const name of Object.keys(attrs)) {
      if (/^on/i.test(name)) {
        findings.push(issue('error', 'handler', `Event handler ${name} found`, 'Inline handlers are dangerous and unsupported.', el.name));
      }
    }
  });

  const imgs = $('img');
  let missingAlt = 0;
  imgs.each((_, el) => {
    if ($(el).attr('alt') === undefined) missingAlt += 1;
  });
  if (missingAlt) findings.push(issue('warning', 'alt', `${missingAlt} image(s) missing alt text`, 'Screen readers and image-blocked clients need alt text.', 'img', { type: 'alt' }));
  else findings.push(issue('ok', 'alt', 'All images have alt attributes'));

  const lang = $('html').attr('lang');
  if (!lang) findings.push(issue('warning', 'lang', 'Missing language metadata', 'Set html lang for accessibility.', 'html', { type: 'lang' }));
  else findings.push(issue('ok', 'lang', `Language set to ${lang}`));

  const headings = $('h1,h2,h3,h4,h5,h6');
  if (!headings.length) findings.push(issue('warning', 'headings', 'No headings found', 'Use a heading for the main message.', 'body'));
  else findings.push(issue('ok', 'headings', `${headings.length} heading(s) found`));

  const links = LinkService.extract(source);
  const empty = links.filter((l) => l.issues.includes('empty'));
  const http = links.filter((l) => l.issues.includes('http'));
  const bad = links.filter((l) => l.issues.includes('malformed') || l.issues.includes('suspicious'));
  if (empty.length) findings.push(issue('warning', 'empty-link', `${empty.length} empty or placeholder link(s)`, null, 'a'));
  if (http.length) findings.push(issue('warning', 'http-link', `${http.length} non-HTTPS link(s)`, 'Prefer HTTPS URLs.', 'a'));
  if (bad.length) findings.push(issue('error', 'bad-link', `${bad.length} malformed or suspicious link(s)`, null, 'a'));
  if (!links.length) findings.push(issue('warning', 'no-links', 'No links detected'));
  else if (!empty.length && !http.length && !bad.length) findings.push(issue('ok', 'links', `${links.length} link(s) look valid`));

  const unsub = links.some((l) => /unsub|opt[- ]?out|manage.?pref/i.test(`${l.href} ${l.text}`));
  if (!unsub) findings.push(issue('warning', 'unsubscribe', 'No unsubscribe link detected', 'Marketing emails should include an unsubscribe or preferences link.', 'a'));
  else findings.push(issue('ok', 'unsubscribe', 'Unsubscribe/preferences link found'));

  if (size > GMAIL_CLIP) {
    findings.push(issue('warning', 'gmail-clip', `HTML is ${(size / 1024).toFixed(1)} KB (Gmail clips around 102 KB)`, 'Reduce markup or images to avoid clipping.', 'document'));
  } else {
    findings.push(issue('ok', 'gmail-clip', `HTML size ${(size / 1024).toFixed(1)} KB is under Gmail clip threshold`));
  }

  if (size > 200 * 1024) {
    findings.push(issue('error', 'html-size', 'HTML exceeds 200 KB', 'Large emails are slow and often clipped.', 'document'));
  }

  imgs.each((_, el) => {
    const w = parseInt($(el).attr('width'), 10);
    const src = $(el).attr('src') || '';
    if (w > 1200) findings.push(issue('warning', 'img-wide', 'Image wider than 1200px', 'Oversized images slow downloads and overflow layouts.', 'img'));
    if (/^data:/i.test(src) && src.length > 80000) {
      findings.push(issue('warning', 'img-data', 'Large data-URI image', 'Gmail blocks many data URIs; host the image instead.', 'img'));
    }
  });

  const colorRe = /color\s*:\s*(#[0-9a-fA-F]{3,8})/i;
  const bgRe = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/i;
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const fg = (style.match(colorRe) || [])[1];
    const bg = (style.match(bgRe) || [])[1];
    if (fg && bg) {
      const ratio = contrastRatio(fg, bg);
      if (ratio != null && ratio < 4.5) {
        findings.push(issue('warning', 'contrast', `Low contrast (${ratio.toFixed(2)}:1)`, 'WCAG AA needs at least 4.5:1 for body text.', el.name));
      }
    }
  });

  const spamWords = ['free!!!', 'act now', 'congratulations', 'winner', 'click here now', 'limited time', 'viagra', 'work from home'];
  const blob = `${$('body').text()} ${$('title').text()}`.toLowerCase();
  const hits = spamWords.filter((w) => blob.includes(w));
  if (hits.length) findings.push(issue('warning', 'spam', `Possible spam phrasing: ${hits.join(', ')}`, 'Avoid exaggerated promotional language.', 'body'));
  else findings.push(issue('ok', 'spam', 'No obvious spam trigger phrases'));

  const cssText = String(css || '') + $('style').text();
  if (/position\s*:\s*(fixed|absolute|sticky)/i.test(cssText)) {
    findings.push(issue('warning', 'position', 'Positioned CSS is unreliable in email', null, 'css'));
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warning').length;
  return { findings, summary: { errors, warnings, passed: findings.filter((f) => f.level === 'ok').length, size } };
}

function applyFixes(html, css, codes) {
  let $ = cheerio.load(String(html || ''), { decodeEntities: false });
  const applied = [];
  const want = new Set(codes && codes.length ? codes : ['doctype', 'alt', 'lang', 'handler']);

  if (want.has('lang') && !$('html').attr('lang')) {
    if ($('html').length) $('html').attr('lang', 'en');
    applied.push('lang');
  }
  if (want.has('alt')) {
    $('img').each((_, el) => {
      if ($(el).attr('alt') === undefined) $(el).attr('alt', '');
    });
    applied.push('alt');
  }
  if (want.has('handler')) {
    $('*').each((_, el) => {
      const attrs = el.attribs || {};
      for (const name of Object.keys(attrs)) {
        if (/^on/i.test(name)) delete attrs[name];
      }
    });
    applied.push('handler');
  }
  $('script,iframe,object,embed').remove();

  let out = $.html();
  if (want.has('doctype') && !/^<!DOCTYPE/i.test(out.trim())) {
    out = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n' + out;
    applied.push('doctype');
  }
  return { html: out, css: css || '', applied };
}

module.exports = { analyze, applyFixes };
