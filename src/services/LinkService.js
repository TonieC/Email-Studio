'use strict';

const cheerio = require('cheerio');

function classifyUrl(raw, seen) {
  const url = String(raw || '').trim();
  const issues = [];
  if (!url || url === '#') issues.push('empty');
  if (/^javascript:/i.test(url) || /^vbscript:/i.test(url) || /^data:/i.test(url)) issues.push('suspicious');
  if (/^http:\/\//i.test(url)) issues.push('http');
  try {
    if (url && !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:') && !url.startsWith('/')) {
      new URL(url);
    }
  } catch (_) {
    if (url && !url.startsWith('#') && !url.startsWith('/')) issues.push('malformed');
  }
  const key = url.toLowerCase();
  if (url && seen.has(key)) issues.push('duplicate');
  if (url) seen.add(key);
  if (/bit\.ly|tinyurl|t\.co|goo\.gl/i.test(url)) issues.push('suspicious');
  return issues;
}

function extract(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false });
  const seen = new Set();
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = ($(el).text() || '').trim().slice(0, 120);
    const issues = classifyUrl(href, seen);
    links.push({
      href,
      text,
      issues,
      snippet: $.html(el).slice(0, 240),
    });
  });
  return links;
}

function withUtm(url, params) {
  try {
    const u = new URL(String(url));
    if (params.utm_source) u.searchParams.set('utm_source', params.utm_source);
    if (params.utm_medium) u.searchParams.set('utm_medium', params.utm_medium);
    if (params.utm_campaign) u.searchParams.set('utm_campaign', params.utm_campaign);
    if (params.utm_term) u.searchParams.set('utm_term', params.utm_term);
    if (params.utm_content) u.searchParams.set('utm_content', params.utm_content);
    return u.toString();
  } catch (_) {
    return url;
  }
}

module.exports = { extract, withUtm, classifyUrl };
