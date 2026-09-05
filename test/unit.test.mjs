import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate the booted server behind a temp DATA_DIR before loading server.js.
const tmp = mkdtempSync(path.join(os.tmpdir(), 'email-studio-unit-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.SESSION_SECRET = 'unit-test-secret';
process.env.PORT = '0';

const require = createRequire(import.meta.url);
const { isEmail, isValidEmailList, validateProjectName, validateSmtpHost } = require('../src/validators.js');
const ConversionService = require('../src/services/ConversionService.js');

test('validators: isEmail', () => {
  assert.equal(isEmail('a@b.co'), true);
  assert.equal(isEmail(' a@b.co '), true);
  assert.equal(isEmail('not-an-email'), false);
  assert.equal(isEmail(''), false);
});

test('validators: isValidEmailList', () => {
  assert.equal(isValidEmailList(undefined), true);
  assert.equal(isValidEmailList(''), true);
  assert.equal(isValidEmailList('a@b.co'), true);
  assert.equal(isValidEmailList('a@b.co, c@d.co; e@f.co'), true);
  assert.equal(isValidEmailList('a@b.co, nope'), false);
});

test('validators: validateProjectName', () => {
  assert.equal(validateProjectName(''), 'Project name is required');
  assert.equal(validateProjectName('x'.repeat(121)), 'Project name must be at most 120 characters');
  assert.equal(validateProjectName('ok'), null);
});

test('validators: validateSmtpHost (SSRF guard)', () => {
  assert.equal(validateSmtpHost(''), 'SMTP host is required');
  assert.equal(validateSmtpHost('169.254.169.254'), 'This SMTP host is not allowed');
  assert.equal(validateSmtpHost('metadata.google.internal'), 'This SMTP host is not allowed');
  assert.equal(validateSmtpHost('metadata.example.com'), 'This SMTP host is not allowed');
  assert.equal(validateSmtpHost('0.0.0.0'), 'This SMTP host is not allowed');
  assert.equal(validateSmtpHost('255.255.255.255'), 'This SMTP host is not allowed');
  assert.equal(validateSmtpHost('999.1.1.1'), 'Invalid SMTP host');
  assert.equal(validateSmtpHost('127.0.0.1'), null);
  assert.equal(validateSmtpHost('10.0.0.5'), null);
  assert.equal(validateSmtpHost('smtp.postmarkapp.com'), null);
});

test('conversion: strips unsafe content', () => {
  const out = ConversionService.convert({
    html: '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>',
    css: '',
  });
  assert.ok(!/script|javascript:|onerror/i.test(out.html), 'unsafe content removed');
  assert.ok(out.warnings.some((w) => /unsafe/i.test(w)), 'warning emitted');
});

test('conversion: inlines css and preserves media queries', () => {
  const out = ConversionService.convert({
    html: '<div class="box">hi</div><style>.box{color:red}</style>',
    css: '@media (max-width:480px){.box{width:100%!important}}',
  });
  assert.match(out.html, /style="[^"]*color\s*:\s*red/, 'css inlined');
  assert.match(out.html, /@media/, 'media query preserved');
  assert.equal(out.stats.mediaQueries, true);
});

test('conversion: flex becomes tables', () => {
  const out = ConversionService.convert({
    html: '<div style="display:flex"><div>a</div><div>b</div></div>',
    css: '',
  });
  assert.equal(out.stats.tables >= 1, true, 'flex converted to table');
  assert.match(out.html, /<table/, 'output contains table');
  assert.ok(typeof out.minified === 'string');
  assert.ok(Array.isArray(out.transformations));
  assert.ok(out.stats.durationMs >= 0);
  assert.ok(out.stats.originalBytes >= 0);
});

const MergeService = require('../src/services/MergeService.js');
const MinifyService = require('../src/services/MinifyService.js');
const EmailDoctorService = require('../src/services/EmailDoctorService.js');
const HtmlImportService = require('../src/services/HtmlImportService.js');
const LinkService = require('../src/services/LinkService.js');

test('merge: applies variables and sanitizes values', () => {
  const html = '<p>Hello {{first_name | there}}</p><a href="{{url}}">x</a>';
  const out = MergeService.applyMerge(html, { first_name: 'Ada', url: '"><script>alert(1)</script>' });
  assert.match(out, /Hello Ada/);
  assert.ok(!/<script/i.test(out));
  assert.ok(MergeService.listVariables(html).includes('first_name'));
});

test('minify: strips comments and extra whitespace', () => {
  const html = MinifyService.minifyHtml('<!-- note --><div>  a  </div>\n  <p>b</p>');
  assert.ok(!/note/.test(html));
  assert.match(html, /<div> a <\/div><p>b<\/p>/);
});

test('doctor: flags scripts and can apply safe fixes', () => {
  const html = '<html><body><img src="x"><script>alert(1)</script></body></html>';
  const report = EmailDoctorService.analyze(html, '');
  assert.ok(report.findings.some((f) => f.code === 'script' && f.level === 'error'));
  assert.ok(report.summary.errors >= 1);
  const fixed = EmailDoctorService.applyFixes(html, '', ['alt', 'lang', 'doctype']);
  assert.ok(fixed.applied.includes('alt'));
  assert.match(fixed.html, /alt=""/);
  assert.match(fixed.html, /lang="en"/);
});

test('html import: extracts css and strips unsafe markup', () => {
  const imported = HtmlImportService.importHtml('<html><head><style>.a{color:red}</style></head><body><p onclick="x()">Hi</p><script>bad()</script></body></html>');
  assert.match(imported.css, /\.a\{color:red\}|\.a \{ color: red \}/);
  assert.ok(!/script/i.test(imported.html));
  assert.ok(!/onclick/i.test(imported.html));
});

test('links: classifies empty, http and suspicious hrefs', () => {
  const links = LinkService.extract('<a href="#">x</a><a href="http://example.com">y</a><a href="javascript:alert(1)">z</a>');
  assert.ok(links.some((l) => l.issues.includes('empty')));
  assert.ok(links.some((l) => l.issues.includes('http')));
  assert.ok(links.some((l) => l.issues.includes('suspicious')));
});

test('rate limiter: login attempts blocked after limit', async () => {
  const { start } = require('../server.js');
  const server = await new Promise((resolve) => {
    const s = start(0);
    s.on('listening', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const boot = await fetch(`${base}/api/auth/bootstrap`);
    const { csrf } = await boot.json();
    const cookie = boot.headers.get('set-cookie').split(';')[0];
    let last = 0;
    for (let i = 0; i < 22; i += 1) {
      const r = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: cookie },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      });
      last = r.status;
    }
    assert.equal(last, 429, 'rate limit kicks in after failed attempts');
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
