import assert from 'node:assert';
import { SMTPServer } from 'smtp-server';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '2525', 10);

let cookie = '';
let csrf = '';
const received = [];

async function req(method, path, body, opts = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    ...opts,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0];
  }
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data, res };
}

async function upload(path, fileBuffer, filename, contentType) {
  const fd = new FormData();
  fd.append('file', new Blob([fileBuffer], { type: contentType }), filename);
  const headers = {};
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: fd });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data };
}

function startSmtpSink() {
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS', 'AUTH'],
    onData(stream, session, callback) {
      let buf = '';
      stream.on('data', (chunk) => { buf += chunk.toString(); });
      stream.on('end', () => {
        const rcpt = session.envelope.rcptTo.map((r) => r.address);
        received.push({ rcpt, from: session.envelope.mailFrom.address, data: buf });
        callback(null, '250 OK: message queued');
      });
    },
  });
  return new Promise((resolve, reject) => {
    server.listen(SMTP_PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

const SAMPLE_HTML = `
<div class="container">
  <h1>Test campaign</h1>
  <p style="color:red">Hello from the email test.</p>
  <img src="/api/assets/PLACEHOLDER/file" alt="Logo" width="200" height="50">
  <a href="https://example.com">Learn more</a>
</div>`;

const SAMPLE_CSS = `
.container { max-width: 600px; margin: 0 auto; font-family: Helvetica, Arial; }
@media (max-width: 480px) { .container { width: 100% !important; } }
h1 { font-size: 24px; color: #111; }
`;

let results = [];
function check(name, fn) {
  results.push({ name, fn });
}

async function run() {
  // 1. Setup
  let r = await req('GET', '/api/auth/bootstrap');
  assert.equal(r.data.needsSetup, true, 'should need setup');
  assert.ok(r.data.csrf, 'bootstrap issues csrf');
  csrf = r.data.csrf;

  // CSRF must be required for POST
  const savedCsrf = csrf;
  csrf = 'invalid';
  r = await req('POST', '/api/auth/setup', { username: 'admin', password: 'password123', confirm: 'password123' });
  assert.equal(r.status, 403, 'invalid csrf should be rejected');
  csrf = savedCsrf;

  r = await req('POST', '/api/auth/setup', { username: 'admin', password: 'password123', confirm: 'password123' });
  assert.equal(r.status, 200, 'setup should succeed');
  assert.equal(r.data.user.username, 'admin');
  csrf = r.data.csrf;

  // NeedsSetup now false
  r = await req('GET', '/api/auth/bootstrap');
  assert.equal(r.data.needsSetup, false);

  // Duplicate setup blocked
  csrf = r.data.csrf;
  r = await req('POST', '/api/auth/setup', { username: 'other', password: 'password123', confirm: 'password123' });
  assert.equal(r.status, 409, 'second setup should be rejected');

  // Bad login
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
  assert.equal(r.status, 401, 'bad login rejected');

  // Good login
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'password123' });
  assert.equal(r.status, 200);
  csrf = r.data.csrf;

  // Unauthorized access (no cookie)
  const savedCookie = cookie;
  cookie = '';
  r = await req('GET', '/api/projects');
  assert.equal(r.status, 401, 'unauthenticated projects access blocked');
  cookie = savedCookie;

  // Create project
  r = await req('POST', '/api/projects', { name: 'Test Project' });
  assert.equal(r.status, 201, 'create project');
  const project = r.data.project;
  assert.ok(project.id, 'project id present');

  // Update with html/css
  r = await req('PUT', `/api/projects/${project.id}`, { name: 'Test Project', html: SAMPLE_HTML, css: SAMPLE_CSS });
  assert.equal(r.status, 200);
  assert.match(r.data.project.html, /Test campaign/);

  // Get
  r = await req('GET', `/api/projects/${project.id}`);
  assert.match(r.data.project.html, /Test campaign/);

  // Duplicate
  r = await req('POST', `/api/projects/${project.id}/duplicate`);
  assert.equal(r.status, 201);
  const dup = r.data.project;
  assert.match(dup.name, /copy/);

  // Delete duplicate
  r = await req('DELETE', `/api/projects/${dup.id}`);
  assert.equal(r.data.ok, true);

  // Upload asset
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  r = await upload('/api/assets', png, 'logo.png', 'image/png');
  assert.equal(r.status, 201, 'asset upload');
  const asset = r.data.asset;
  assert.ok(asset.url, 'asset url present');

  // Fetch asset file (public)
  r = await req('GET', asset.url);
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('content-type'), /image\/png/);

  // Reject disallowed type
  const evil = Buffer.from('<script>alert(1)</script>');
  r = await upload('/api/assets', evil, 'evil.svg', 'image/svg+xml');
  assert.equal(r.status, 415, 'svg upload rejected');

  // Rename asset
  r = await req('PATCH', `/api/assets/${asset.id}`, { name: 'renamed.png' });
  assert.equal(r.data.asset.original_name, 'renamed.png');

  // Convert with asset URL
  const htmlWithAsset = SAMPLE_HTML.replace('PLACEHOLDER', asset.id);
  r = await req('POST', '/api/convert', { html: htmlWithAsset, css: SAMPLE_CSS });
  assert.equal(r.status, 200);
  assert.match(r.data.html, /Test campaign/);
  assert.match(r.data.html, /style="[^"]*color\s*:\s*red/, 'inline css applied');
  assert.match(r.data.html, /@media/, 'media queries preserved');
  assert.ok(Array.isArray(r.data.compatibility));
  assert.match(r.data.html, /alt="Logo"/, 'alt preserved');

  // Unsafe content removed
  r = await req('POST', '/api/convert', { html: '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>', css: '' });
  assert.equal(r.status, 200);
  assert.ok(!/script|javascript:|onerror/i.test(r.data.html), 'unsafe content stripped');

  // SMTP account pointing at local sink
  r = await req('POST', '/api/accounts/smtp', {
    name: 'Local sink', email: 'sender@test.dev', host: '127.0.0.1', port: String(SMTP_PORT),
    encryption: 'none', username: '', credential: '',
  });
  assert.equal(r.status, 201, 'create smtp account');
  const smtpAccount = r.data.account;

  // Verify account
  r = await req('POST', `/api/accounts/${smtpAccount.id}/verify`);
  assert.equal(r.status, 200, 'smtp verify ok');

  // Accounts list must not leak credentials
  r = await req('GET', '/api/accounts');
  assert.equal(r.status, 200);
  for (const a of r.data.accounts) {
    assert.ok(!('config' in a) && !('credential' in a), 'no credentials leaked');
  }

  // Send (converted html)
  r = await req('POST', '/api/send', {
    accountId: smtpAccount.id, to: 'recipient@test.dev', subject: 'Hello from Email Studio',
    html: (await (await fetch(BASE + '/api/convert', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: cookie }, body: JSON.stringify({ html: htmlWithAsset, css: SAMPLE_CSS }) })).json()).html,
    projectId: project.id, projectName: project.name,
  });
  assert.equal(r.status, 200, 'send succeeds');
  assert.equal(received.length, 1, 'smtp sink got 1 message');
  const msg = received[0];
  assert.equal(msg.rcpt[0], 'recipient@test.dev');
  assert.match(msg.data, /Hello from Email Studio/, 'subject present');
  assert.match(msg.data, /Test campaign/, 'converted html sent');
  assert.match(msg.data, /Content-Type: text\/html/, 'html content type');

  // Send with bad recipient -> recorded as failed
  r = await req('POST', '/api/send', {
    accountId: smtpAccount.id, to: 'not-an-email', subject: 'x', html: '<p>hi</p>', projectId: project.id, projectName: project.name,
  });
  assert.equal(r.status, 400, 'invalid email rejected');

  // History
  r = await req('GET', '/api/history');
  assert.equal(r.status, 200);
  assert.ok(r.data.history.length >= 1);
  const sent = r.data.history.find((h) => h.status === 'sent');
  assert.ok(sent, 'sent history recorded');
  assert.equal(sent.provider, '127.0.0.1');

  // Templates
  r = await req('GET', '/api/templates');
  assert.ok(r.data.templates.length >= 6, 'seed templates exist');
  r = await req('POST', `/api/templates/${r.data.templates[0].key}/use`);
  assert.equal(r.status, 201, 'use template creates project');
  const tpProject = r.data.project;

  // Folders + bulk
  r = await req('POST', '/api/folders', { name: 'Campaigns' });
  assert.equal(r.status, 201, 'create folder');
  const folder = r.data.folder;
  r = await req('POST', '/api/projects/bulk', { ids: [project.id], action: 'move', folderId: folder.id });
  assert.equal(r.status, 200);
  r = await req('GET', `/api/projects?folderId=${folder.id}`);
  assert.ok(r.data.projects.some((p) => p.id === project.id));
  r = await req('POST', '/api/projects/bulk', { ids: [project.id], action: 'favorite' });
  assert.equal(r.status, 200);

  // Contacts + merge
  r = await req('POST', '/api/contacts', { email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace', tags: ['vip'] });
  assert.equal(r.status, 201, 'create contact');
  const contact = r.data.contact;
  r = await req('POST', '/api/contacts/preview', { contactId: contact.id, html: '<p>Hi {{first_name}}</p>' });
  assert.match(r.data.html, /Hi Ada/);
  r = await req('POST', '/api/contacts/import', { csv: 'email,first_name\nbad-email,Nope\nok@example.com,Ok' });
  assert.equal(r.status, 200);
  assert.equal(r.data.imported, 1);

  // Import HTML
  r = await req('POST', '/api/projects/import', { name: 'Imported', html: '<html><head><style>p{color:blue}</style></head><body><p onclick="x()">Hello</p><script>bad()</script></body></html>' });
  assert.equal(r.status, 201, 'import project');
  assert.ok(!/script/i.test(r.data.project.html));

  // Email doctor
  r = await req('POST', '/api/convert/doctor', { html: '<html><body><img src="x"><script>alert(1)</script></body></html>', css: '' });
  assert.equal(r.status, 200);
  assert.ok(r.data.findings.some((f) => f.code === 'script'));
  r = await req('POST', '/api/convert/doctor/fix', { html: '<html><body><img src="x"></body></html>', css: '' });
  assert.ok(r.data.applied.includes('alt') || r.data.html.includes('alt='));

  // API keys skip CSRF for /api/v1
  r = await req('POST', '/api/keys', { name: 'e2e' });
  assert.equal(r.status, 201);
  const apiKey = r.data.key.key;
  assert.match(apiKey, /^es_/);
  const savedCsrf2 = csrf;
  csrf = '';
  r = await fetch(BASE + '/api/v1/projects', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + apiKey },
  });
  assert.equal(r.status, 200, 'api key authenticates GET /api/v1/projects');
  r = await fetch(BASE + '/api/v1/projects', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'API project' }),
  });
  assert.equal(r.status, 201, 'api key POST skips CSRF');
  r = await fetch(BASE + '/api/v1/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'no auth' }),
  });
  assert.ok(r.status === 401 || r.status === 403, 'v1 without session or key is blocked');
  csrf = savedCsrf2;

  // Webhooks reject private URLs
  r = await req('POST', '/api/webhooks', { url: 'http://127.0.0.1/hook', events: ['send.success'] });
  assert.equal(r.status, 400, 'localhost webhook rejected');
  r = await req('POST', '/api/webhooks', { url: 'https://example.com/hooks/email', events: ['send.success'] });
  assert.equal(r.status, 201, 'https webhook accepted');
  assert.ok(r.data.webhook.secret, 'webhook secret returned once');

  // Settings
  r = await req('PUT', '/api/settings', { appName: 'Test Studio', publicBaseUrl: 'https://emails.example.com' });
  assert.equal(r.status, 200);
  r = await req('GET', '/api/settings');
  assert.equal(r.data.settings.appName, 'Test Studio');

  // Password change
  r = await req('POST', '/api/auth/password', { oldPassword: 'password123', newPassword: 'newpassword456', confirm: 'newpassword456' });
  assert.equal(r.status, 200);
  r = await req('POST', '/api/auth/login', { username: 'admin', password: 'newpassword456' });
  assert.equal(r.status, 200, 'login with new password');
  csrf = r.data.csrf;

  // Logout
  r = await req('POST', '/api/auth/logout');
  assert.equal(r.data.ok, true);
  cookie = '';
  r = await req('GET', '/api/projects');
  assert.equal(r.status, 401, 'logged out blocks access');

  return { project, asset, tpProject };
}

const smtpServer = await startSmtpSink();
let mainResult;
try {
  mainResult = await run();
  console.log('E2E: all assertions passed');
  console.log('  project:', mainResult.project.id);
  console.log('  asset:', mainResult.asset.id);
  console.log('  template project:', mainResult.tpProject.id);
} catch (err) {
  console.error('E2E FAILED:', err.message);
  process.exitCode = 1;
} finally {
  smtpServer.close();
}
