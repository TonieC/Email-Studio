'use strict';

const db = require('../db');
const crypto = require('crypto');

const BUILTINS = [
  { key: 'blank', name: 'Blank Email', description: 'Empty canvas with a responsive 600px container.', html: '', css: '' },
  {
    key: 'welcome',
    name: 'Welcome Email',
    description: 'A friendly introduction for new subscribers.',
    html: `<div class="container">
  <div class="logo"><span class="logo-text">Acme</span></div>
  <div class="card">
    <h1>Welcome aboard!</h1>
    <p>We are thrilled to have you with us. Your account is ready and there is a lot to explore.</p>
    <a href="#" class="button">Get started</a>
    <p class="muted">Questions? Just reply to this email, we are here to help.</p>
  </div>
  <div class="footer">
    <p>Sent with love by Acme Inc.</p>
    <a href="#">Unsubscribe</a>
  </div>
</div>`,
    css: `.container {
  margin: 0 auto;
  max-width: 600px;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: #f5f7fa;
  padding: 24px;
}
.logo-text { color: #4f46e5; font-size: 20px; font-weight: 700; }
.card {
  background: #ffffff;
  border-radius: 8px;
  padding: 32px;
  margin-top: 16px;
  border: 1px solid #e5e7eb;
}
h1 { font-size: 24px; color: #111827; margin: 0 0 12px; }
p { font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 16px; }
.muted { color: #6b7280; font-size: 13px; }
.button {
  display: inline-block;
  background: #4f46e5;
  color: #ffffff !important;
  text-decoration: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  margin: 8px 0 16px;
}
.footer { text-align: center; padding-top: 16px; color: #9ca3af; font-size: 12px; }
.footer a { color: #6b7280; }`,
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    description: 'Article digest with a two-column layout.',
    html: `<div class="container">
  <div class="header">
    <span class="brand">The Daily Byte</span>
    <span class="issue">Issue #42</span>
  </div>
  <div class="hero">
    <h1>This week in tech</h1>
    <p>Five stories worth your time, hand picked by our editors.</p>
  </div>
  <table class="grid" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="col">
        <div class="article">
          <h3>Why serverless is still confusing</h3>
          <p>Billing surprises, cold starts and vendor lock-in. What you actually need to know.</p>
          <a href="#">Read more</a>
        </div>
      </td>
      <td class="gap"></td>
      <td class="col">
        <div class="article">
          <h3>Designing for email clients</h3>
          <p>A practical guide to tables, fallbacks and media queries that actually work.</p>
          <a href="#">Read more</a>
        </div>
      </td>
    </tr>
  </table>
  <div class="footer">
    <p>You are receiving this because you subscribed.</p>
    <a href="#">Unsubscribe</a> · <a href="#">Preferences</a>
  </div>
</div>`,
    css: `.container { margin: 0 auto; max-width: 600px; width: 100%; font-family: Georgia, 'Times New Roman', serif; background: #ffffff; padding: 24px; }
.header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
.brand { font-size: 18px; font-weight: 700; color: #111827; }
.issue { float: right; color: #6b7280; font-size: 13px; }
.hero { background: #111827; color: #ffffff; padding: 32px; margin-bottom: 20px; }
.hero h1 { margin: 0 0 8px; font-size: 28px; }
.hero p { margin: 0; color: #d1d5db; }
.col { width: 50%; }
.gap { width: 16px; }
.article { border: 1px solid #e5e7eb; padding: 20px; height: 100%; }
.article h3 { margin: 0 0 8px; font-size: 18px; color: #111827; }
.article p { margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: #4b5563; }
.article a { color: #4f46e5; font-weight: 600; }
.footer { margin-top: 20px; text-align: center; color: #6b7280; font-size: 12px; }
.footer a { color: #4f46e5; }`,
  },
  {
    key: 'product',
    name: 'Product Announcement',
    description: 'Launch or feature announcement with a call to action.',
    html: `<div class="container">
  <div class="brand">Nimbus Cloud</div>
  <div class="banner">
    <img src="" alt="Product banner" width="600" style="width: 100%; height: auto;" />
  </div>
  <div class="content">
    <p class="eyebrow">New release</p>
    <h1>Nimbus 2.0 is here</h1>
    <p>Faster builds, a brand new dashboard, and the collaboration tools your team asked for. Everything you love, reinvented.</p>
    <a href="#" class="button">See what's new</a>
  </div>
  <div class="features">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td class="feature">
          <h3>10x faster</h3>
          <p>Builds now run in seconds with our new cache engine.</p>
        </td>
        <td class="feature">
          <h3>Real-time</h3>
          <p>Live cursors and comments for the whole team.</p>
        </td>
        <td class="feature">
          <h3>Secure by default</h3>
          <p>Encrypted at rest with granular access controls.</p>
        </td>
      </tr>
    </table>
  </div>
  <div class="footer">
    <p>© 2025 Nimbus Cloud Inc.</p>
    <a href="#">Unsubscribe</a>
  </div>
</div>`,
    css: `.container { margin: 0 auto; max-width: 600px; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; }
.brand { text-align: center; padding: 24px; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px; }
.banner { line-height: 0; }
.content { padding: 32px; text-align: center; }
.eyebrow { text-transform: uppercase; letter-spacing: 2px; color: #e11d48; font-weight: 700; font-size: 13px; margin: 0 0 8px; }
h1 { margin: 0 0 12px; font-size: 30px; color: #0f172a; }
.content p { color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 24px; }
.button { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; }
.features { padding: 0 24px 24px; }
.feature { width: 33%; padding: 12px; }
.feature h3 { margin: 0 0 6px; font-size: 15px; color: #0f172a; }
.feature p { margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; }
.footer { text-align: center; padding: 24px; background: #f8fafc; color: #94a3b8; font-size: 12px; }
.footer a { color: #475569; }`,
  },
  {
    key: 'transactional',
    name: 'Transactional Email',
    description: 'Order or receipt confirmation with a clear summary.',
    html: `<div class="container">
  <div class="header">
    <span class="brand">Shopline</span>
    <span class="order-id">Order #1042</span>
  </div>
  <div class="card">
    <h1>Thanks for your order!</h1>
    <p class="sub">Your payment was successful. Here is a summary of your purchase.</p>
    <table class="items" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr class="row">
        <td class="name">Wireless Keyboard</td>
        <td class="qty">× 1</td>
        <td class="price">$79.00</td>
      </tr>
      <tr class="row">
        <td class="name">USB-C Hub</td>
        <td class="qty">× 1</td>
        <td class="price">$49.00</td>
      </tr>
    </table>
    <div class="total">
      <span>Subtotal</span><span>$128.00</span>
      <span>Shipping</span><span>Free</span>
      <span class="grand">Total</span><span class="grand">$128.00</span>
    </div>
    <a href="#" class="button">View order</a>
  </div>
  <div class="footer">
    <p>Questions about your order? <a href="#">Contact support</a></p>
  </div>
</div>`,
    css: `.container { margin: 0 auto; max-width: 600px; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px 16px; }
.brand { font-size: 18px; font-weight: 800; color: #0f172a; }
.order-id { font-size: 13px; color: #64748b; }
.card { background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e2e8f0; }
h1 { margin: 0 0 6px; font-size: 22px; color: #0f172a; }
.sub { margin: 0 0 20px; color: #64748b; font-size: 14px; }
.items { border-top: 1px solid #e2e8f0; }
.row td { padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
.name { color: #0f172a; }
.qty, .price { color: #475569; text-align: right; }
.price { width: 90px; }
.total { margin-top: 16px; color: #475569; font-size: 14px; }
.total span { display: block; padding: 4px 0; }
.total span span { float: right; }
.grand { font-weight: 700; color: #0f172a; font-size: 16px; }
.button { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; margin-top: 20px; }
.footer { text-align: center; padding: 16px 0 0; font-size: 12px; color: #94a3b8; }
.footer a { color: #2563eb; }`,
  },
  {
    key: 'notification',
    name: 'Notification',
    description: 'Alert-style email for system or account events.',
    html: `<div class="container">
  <div class="icon">!</div>
  <div class="card">
    <p class="tag">Security alert</p>
    <h1>A new device signed in</h1>
    <p>We noticed a new sign-in to your account on <strong>Chrome, macOS</strong> from <strong>Berlin, DE</strong>.</p>
    <p class="detail">If this was you, no action is needed. Otherwise please secure your account immediately.</p>
    <a href="#" class="button">Review activity</a>
    <div class="meta">
      <span>Device: MacBook Pro</span>
      <span>Time: Today, 09:41 UTC</span>
    </div>
  </div>
  <div class="footer">
    <p>This is an automated security notice from Guardly.</p>
  </div>
</div>`,
    css: `.container { margin: 0 auto; max-width: 520px; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; padding: 40px 20px; }
.icon { width: 48px; height: 48px; margin: 0 auto 20px; border-radius: 50%; background: #f59e0b; color: #0f172a; text-align: center; line-height: 48px; font-weight: 800; font-size: 24px; }
.card { background: #ffffff; border-radius: 10px; padding: 28px; }
.tag { text-transform: uppercase; letter-spacing: 1.5px; font-size: 12px; font-weight: 700; color: #f59e0b; margin: 0 0 8px; }
h1 { margin: 0 0 12px; font-size: 22px; color: #0f172a; }
.card p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 12px; }
.detail { background: #fef3c7; border: 1px solid #fde68a; color: #92400e !important; border-radius: 6px; padding: 12px; }
.button { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-weight: 600; margin-top: 8px; }
.meta { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 13px; color: #94a3b8; }
.meta span { display: block; padding: 2px 0; }
.footer { text-align: center; padding-top: 16px; color: #94a3b8; font-size: 12px; }`,
  },
];

let seeded = false;

function seed() {
  if (seeded) return;
  seeded = true;
  const count = db.prepare('SELECT COUNT(*) AS n FROM settings WHERE key = ?').get('templates_seeded');
  if (count.n > 0) return;
  const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const txn = db.transaction(() => {
    for (const t of BUILTINS) {
      insert.run('template:' + t.key, JSON.stringify({ name: t.name, description: t.description, html: t.html, css: t.css }));
    }
    insert.run('templates_seeded', '1');
  });
  txn();
}

function list() {
  seed();
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE \'template:%\' ORDER BY key').all();
  return rows.map((r) => {
    const data = JSON.parse(r.value);
    return { key: r.key.slice('template:'.length), name: data.name, description: data.description };
  });
}

function get(key) {
  seed();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('template:' + String(key).replace(/[^a-z0-9_-]/gi, ''));
  if (!row) return null;
  const data = JSON.parse(row.value);
  return { key, name: data.name, html: data.html, css: data.css };
}

function save(key, name, description, html, css) {
  seed();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'template:' + String(key).replace(/[^a-z0-9_-]/gi, ''),
    JSON.stringify({ name, description, html, css })
  );
}

function remove(key) {
  seed();
  return db.prepare('DELETE FROM settings WHERE key = ?').run('template:' + String(key).replace(/[^a-z0-9_-]/gi, '')).changes > 0;
}

module.exports = { list, get, save, remove, seed, newId: () => crypto.randomUUID() };
