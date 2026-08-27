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
