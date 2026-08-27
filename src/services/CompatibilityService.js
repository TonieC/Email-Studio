'use strict';

const cheerio = require('cheerio');

const CLIENT_GUIDANCE = {
  gmail: {
    name: 'Gmail',
    tips: [
      'Gmail app clips emails around 102 KB in the inbox; the full message is available after expansion.',
      'Gmail app ignores <style> media queries and max-width on the app render; design for ~600px.',
      'Supports inline CSS, tables, and background colors on <td>.',
      'Does not support <style> in the Gmail app for iOS/Android; inline everything important.',
      'Data URI images are blocked by Gmail; host images at an absolute URL.',
    ],
  },
  outlook: {
    name: 'Outlook',
    tips: [
      'Outlook (Word engine) has the weakest CSS support: no flexbox, grid, or media queries in desktop clients.',
      'Use tables and inline styles; bulletproof buttons with VML are recommended for full compatibility.',
      'Padding on <p> and <div> is ignored in some Outlook versions — apply padding to <td> instead.',
      'Web fonts, border-radius, box-shadow and background images have limited or no support.',
      'Add MSO conditional comments for Outlook-specific styling where needed.',
    ],
  },
  appleMail: {
    name: 'Apple Mail',
    tips: [
      'Excellent CSS support, including media queries, flexbox and many modern properties.',
      'Screens may be retina; provide larger images for sharpness.',
      'Dark Mode can invert colors — test light and dark appearances.',
    ],
  },
  yahoo: {
    name: 'Yahoo Mail',
    tips: [
      'Uses a stricter sanitizer; keep markup simple and semantic.',
      'Some CSS properties are stripped — inline critical styles.',
      'Anchors should have explicit color since inherited colors are unreliable.',
    ],
  },
};

function analyze(generatedHtml, sourceCss) {
  const results = [];
  const ok = (msg) => results.push({ level: 'ok', message: msg });
  const warn = (msg, detail) => results.push({ level: 'warn', message: msg, detail });
  const info = (msg, detail) => results.push({ level: 'info', message: msg, detail });

  const $ = cheerio.load(generatedHtml || '', { decodeEntities: false });
  const allCss = [String(sourceCss || ''), $('style').text()].join('\n');

  if (/^<!DOCTYPE/i.test(generatedHtml.trim())) ok('HTML document is valid and well-formed');
  else warn('No HTML doctype found');

  if ($('script').length === 0) ok('No executable scripts present');
  else warn('Scripts found in generated HTML');

  const inlineCount = ($('*[style]').length);
  if (inlineCount > 0) ok(`CSS inlined across ${inlineCount} element(s)`);

  const images = $('img');
  const noAlt = images.filter((_, el) => !$(el).attr('alt') && $(el).attr('alt') !== undefined ? false : !$(el).attr('alt'));
  const missingAlt = images.filter((_, el) => $(el).attr('alt') === undefined).length;
  const emptyAlt = images.filter((_, el) => $(el).attr('alt') === '').length;
  if (images.length === 0) info('No images detected');
  else if (missingAlt > 0) warn(`${missingAlt} image(s) missing alt text`);
  else {
    ok('All images have alt text');
    if (emptyAlt === images.length) info('All images use empty alt text (decorative images)');
  }

  const links = $('a[href]');
  if (links.length > 0) ok(`${links.length} link(s) detected`);
  else info('No links detected');

  const dataImages = images.filter((_, el) => /^data:/i.test($(el).attr('src') || ''));
  if (dataImages.length > 0) {
    let bytes = 0;
    dataImages.each((_, el) => { bytes += Buffer.byteLength($(el).attr('src'), 'utf8'); });
    if (bytes > 50000) warn(`${dataImages.length} image(s) use base64 data URIs totaling ~${(bytes / 1024).toFixed(0)} KB`, 'Gmail and some clients block data URIs; use hosted URLs for large images.');
    else info(`${dataImages.length} image(s) use data URIs`, 'Small data-URI images work in most clients.');
  }

  if (/@media/i.test(allCss)) ok('Responsive media queries present');
  else info('No media queries detected', 'Consider adding responsive rules for mobile clients.');

  if (/background\s*:\s*url|background-image\s*:\s*url/i.test(allCss)) {
    warn('Background images detected', 'Limited support in Outlook; Gmail app, and some clients. Provide a background-color fallback.');
  }

  if (/(?:^|[;}])\s*display\s*:\s*(flex|inline-flex|grid|inline-grid)/i.test(allCss)) {
    warn('flexbox/grid CSS detected', 'Not supported by Outlook desktop clients. Prefer tables for layout.');
  }

  if (/position\s*:\s*(fixed|absolute|sticky)/i.test(allCss)) {
    warn('positioned elements detected', 'fixed/absolute positioning is unreliable in email clients.');
  }

  if (/(box-shadow|text-shadow|border-radius)/i.test(allCss)) {
    warn('shadow/rounded-corner CSS detected', 'Limited support in Outlook (Word engine). Fallbacks are recommended.');
  }

  if (/@import|@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(allCss)) {
    warn('Web fonts detected', 'Outlook and Gmail app do not reliably render web fonts; fall back to system fonts.');
  }

  const bigImages = images.filter((_, el) => {
    const w = parseInt($(el).attr('width'), 10);
    return !Number.isNaN(w) && w > 640;
  });
  if (bigImages.length > 0) warn(`${bigImages.length} image(s) wider than 640px`, 'Large images may overflow narrow mobile clients.');

  const forms = $('form,input,select,textarea,button');
  if (forms.length > 0) warn('Form elements detected', 'Forms are not supported in email; replace with links.');

  const bodyStyle = $('body').attr('style') || '';
  const hasMaxWidth = /max-width\s*:\s*\d/i.test(allCss) || /max-width\s*:\s*\d/i.test(bodyStyle);
  if (hasMaxWidth) ok('Content width is constrained with max-width');
  else info('No max-width constraint detected', 'Consider a centered 600px container for consistent rendering.');

  const videos = $('video,iframe,embed,object');
  if (videos.length > 0) warn('Embedded media detected', 'Video/iframe content is unreliable in email; use a linked thumbnail image.');

  if ($('table').length === 0) info('No tables detected', 'Most clients still need table-based layouts for full compatibility.');

  if (!hasMaxWidth && /@media/i.test(allCss)) {
    info('Media queries exist without a max-width container', 'Pair media queries with a container that has a width in px or %');
  }

  return { results, clients: CLIENT_GUIDANCE };
}

module.exports = { analyze };
