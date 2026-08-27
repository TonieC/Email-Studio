import { el, clear, toast, formatBytes, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { state, set } from '../state.js';
import { loadAccounts, loadSettings } from '../actions.js';

export function renderSettings() {
  const page = el('div', { class: 'page' });
  const head = el('div', { class: 'page-head' }, [el('h1', { text: 'Settings' })]);
  const tabs = el('div', { class: 'seg', style: 'margin-bottom:16px' }, [
    el('button', { class: 'active', text: 'Email Accounts', onclick: () => renderTab('accounts', content) }),
    el('button', { text: 'General', onclick: () => renderTab('general', content) }),
    el('button', { text: 'Security', onclick: () => renderTab('security', content) }),
    el('button', { text: 'Storage', onclick: () => renderTab('storage', content) }),
    el('button', { text: 'Appearance', onclick: () => renderTab('appearance', content) }),
  ]);
  const content = el('div');
  page.append(head, tabs, content);
  clear(state.mainEl);
  state.mainEl.append(page);
  renderTab('accounts', content);
}

function setActiveTab(which) {
  const seg = document.querySelector('.page .seg');
  if (!seg) return;
  seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  const map = { accounts: 0, general: 1, security: 2, storage: 3, appearance: 4 };
  const idx = map[which];
  if (idx !== undefined && seg.children[idx]) seg.children[idx].classList.add('active');
}

function renderTab(tab, content) {
  setActiveTab(tab);
  clear(content);
  if (tab === 'accounts') renderAccounts(content);
  else if (tab === 'general') renderGeneral(content);
  else if (tab === 'security') renderSecurity(content);
  else if (tab === 'storage') renderStorage(content);
  else renderAppearance(content);
}

/* ---------- Email Accounts ---------- */

function renderAccounts(content) {
  const gmailAccount = state.accounts.find((a) => a.type === 'gmail');

  const gmailCard = el('div', { class: 'card-list-item', style: 'cursor:default' }, [
    el('div', { class: 'body' }, [
      el('div', { class: 'name' }, [el('span', { text: 'Gmail' }), el('span', { class: 'badge gmail', style: 'margin-left:8px', text: 'OAuth 2.0' })]),
      el('div', { class: 'meta', text: gmailAccount ? `Connected as ${gmailAccount.email}` : (state.gmailConfigured ? 'Not connected' : 'Server-side OAuth not configured') }),
    ]),
    el('div', { class: 'actions' }, [
      gmailAccount ? el('button', { class: 'btn', text: 'Verify', onclick: () => verifyAccount(gmailAccount) }) : null,
      gmailAccount ? el('button', { class: 'btn danger', text: 'Disconnect', onclick: () => removeAccount(gmailAccount) }) : null,
      el('button', { class: 'btn primary', text: gmailAccount ? 'Reconnect Gmail' : 'Connect Gmail', onclick: () => connectGmail() }),
    ]),
  ]);

  content.append(el('div', { class: 'section-title', text: 'Providers' }));
  content.append(gmailCard);

  content.append(el('div', { class: 'section-title', style: 'margin-top:18px', text: 'SMTP accounts' }));
  const smtpList = el('div', { class: 'card-list' });
  for (const a of state.accounts.filter((x) => x.type === 'smtp')) {
    smtpList.append(smtpCard(a));
  }
  if (!state.accounts.some((x) => x.type === 'smtp')) {
    smtpList.append(el('div', { class: 'empty-state', text: 'No SMTP accounts yet.' }));
  }
  content.append(smtpList);

  const addBtn = el('button', { class: 'btn', text: '+ Add SMTP account', style: 'margin-top:10px', onclick: () => smtpForm(null) });
  content.append(addBtn);

  if (!state.gmailConfigured) {
    content.append(el('div', { class: 'hint', style: 'margin-top:16px', text: 'To enable Gmail, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment, then restart.' }));
  }
}

function smtpCard(a) {
  return el('div', { class: 'card-list-item', style: 'cursor:default' }, [
    el('div', { class: 'body' }, [
      el('div', { class: 'name' }, [el('span', { text: a.name }), el('span', { class: 'badge smtp', style: 'margin-left:8px', text: 'SMTP' })]),
      el('div', { class: 'meta', text: a.email }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn', text: 'Verify', onclick: () => verifyAccount(a) }),
      el('button', { class: 'btn', text: 'Edit', onclick: () => smtpForm(a) }),
      el('button', { class: 'btn danger', text: 'Delete', onclick: () => removeAccount(a) }),
    ]),
  ]);
}

function connectGmail() {
  if (!state.gmailConfigured) { toast('Gmail OAuth is not configured on the server', 'warn'); return; }
  api.post('/api/accounts/gmail/connect').then((res) => {
    window.location.href = res.url;
  }).catch((e) => toast(e.message, 'error'));
}

async function verifyAccount(a) {
  try {
    await api.post(`/api/accounts/${a.id}/verify`);
    toast('Connection verified', 'success');
  } catch (e) {
    toast(`Verification failed: ${e.message}`, 'error');
    if (e.code === 'GMAIL_AUTH_EXPIRED') toast('Gmail authorization expired — reconnect Gmail', 'warn', 8000);
  }
}

async function removeAccount(a) {
  const ok = await confirmDialog('Remove account', `Remove "${a.name}"?`);
  if (!ok) return;
  try {
    await api.del(`/api/accounts/${a.id}`);
    toast('Account removed', 'info');
    await loadAccounts();
    await loadSettings();
    renderSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function smtpForm(existing) {
  const f = (label, val, placeholder) => el('input', { type: 'text', value: val || '', placeholder });
  const host = f('', existing ? '' : '', 'smtp.example.com');
  const port = f('', existing ? '' : '', '587');
  const enc = el('select', {}, ['tls', 'ssl', 'none'].map((v) => el('option', { value: v, text: v === 'none' ? 'None (plain)' : v.toUpperCase() })));
  enc.value = (existing && existing.config && existing.config.encryption) || 'tls';
  const username = f('', existing ? '' : '', 'user@example.com');
  const credential = el('input', { type: 'password', placeholder: existing ? 'Leave blank to keep current' : 'Password / app password' });
  const name = f('', existing ? existing.name : '', 'My SMTP');
  const email = f('', existing ? existing.email : '', 'sender@example.com');

  const body = el('div', { class: 'modal-body' }, [
    field('Account name', name),
    field('Sender email', email),
    field('Host', host),
    field('Port', port),
    field('Encryption', enc),
    field('Username', username),
    field('Credential', credential),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn', text: 'Save', onclick: async () => {
      const payload = {
        accountId: existing ? existing.id : undefined,
        name: name.value, email: email.value, host: host.value, port: port.value,
        encryption: enc.value, username: username.value, credential: credential.value,
      };
      if (!payload.host.trim() || !payload.port.trim()) { toast('Host and port are required', 'warn'); return; }
      try {
        const res = await api.post('/api/accounts/smtp', payload);
        close();
        toast('SMTP account saved', 'success');
        await loadAccounts();
        renderSettings();
        if (res.account && res.account.id) verifyAccount(res.account);
      } catch (e) {
        toast(`Failed: ${e.message}`, 'error');
      }
    } }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: existing ? 'Edit SMTP account' : 'Add SMTP account' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
}

function field(label, input) {
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

/* ---------- General ---------- */

function renderGeneral(content) {
  const s = state.settings;
  const appName = el('input', { type: 'text', value: s.appName || '' });
  const baseUrl = el('input', { type: 'text', value: s.publicBaseUrl || '', placeholder: 'https://email.example.com' });
  const fromAddr = el('input', { type: 'text', value: state.sendDefaults.fromAddress || '', placeholder: 'Sender <sender@example.com>' });
  const inline = el('input', { type: 'checkbox' });
  inline.checked = !!s.inlineAssets;

  const defaultAccount = el('select', {}, [el('option', { value: '', text: '— Default account —' }), ...state.accounts.map((a) => el('option', { value: a.id, text: `${a.name} <${a.email}>` }))]);
  defaultAccount.value = state.sendDefaults.defaultAccountId || '';

  const card = el('div', { style: 'max-width:520px' }, [
    field('App name', appName),
    el('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Public base URL is used to build absolute asset URLs in emails. Leave blank for relative URLs.' }),
    field('Public base URL', baseUrl),
    field('Default from address', fromAddr),
    field('Default account', defaultAccount),
    field('Inline local images on convert', inline),
    el('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Inline local images base64-encodes asset images into the email so recipients always see them. Increases email size.' }),
    el('button', { class: 'btn primary', text: 'Save settings', onclick: async () => {
      try {
        await api.put('/api/settings', {
          appName: appName.value, publicBaseUrl: baseUrl.value, fromAddress: fromAddr.value,
          inlineAssets: inline.checked, defaultAccountId: defaultAccount.value,
        });
        toast('Settings saved', 'success');
        await loadSettings();
      } catch (e) {
        toast(e.message, 'error');
      }
    } }),
  ]);
  content.append(card);
}

/* ---------- Security ---------- */

function renderSecurity(content) {
  const oldPw = el('input', { type: 'password', autocomplete: 'current-password' });
  const newPw = el('input', { type: 'password', autocomplete: 'new-password' });
  const confirmPw = el('input', { type: 'password', autocomplete: 'new-password' });
  const card = el('div', { style: 'max-width:520px' }, [
    field('Current password', oldPw),
    field('New password (min 8 chars)', newPw),
    field('Confirm new password', confirmPw),
    el('button', { class: 'btn primary', text: 'Change password', onclick: async () => {
      if (newPw.value !== confirmPw.value) { toast('Passwords do not match', 'warn'); return; }
      try {
        await api.post('/api/auth/password', { oldPassword: oldPw.value, newPassword: newPw.value, confirm: confirmPw.value });
        toast('Password changed', 'success');
        oldPw.value = newPw.value = confirmPw.value = '';
      } catch (e) {
        toast(e.message, 'error');
      }
    } }),
  ]);
  content.append(card);
}

/* ---------- Storage ---------- */

function renderStorage(content) {
  const st = state.storage || {};
  const rows = [
    ['Data directory', st.dataDir || '—'],
    ['SQLite database', formatBytes(st.databaseFileBytes || 0)],
    ['Assets files', `${st.assets ? st.assets.files : 0} files, ${formatBytes((st.assets && st.assets.bytes) || 0)}`],
    ['Project content (DB)', formatBytes(st.databaseBytes || 0)],
  ];
  const card = el('div', { style: 'max-width:520px' });
  for (const [label, value] of rows) {
    card.append(el('div', { class: 'row', style: 'justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a2a' }, [
      el('span', { class: 'muted', text: label }),
      el('span', { class: 'mono', text: value }),
    ]));
  }
  card.append(el('div', { class: 'hint', style: 'margin-top:12px', text: 'All persistent data lives under ./data on the host (mounted into the container as /app/data). Back up this directory.' }));
  content.append(card);
}

/* ---------- Appearance ---------- */

function renderAppearance(content) {
  content.append(el('div', { style: 'max-width:520px' }, [
    field('Theme', el('select', {}, [el('option', { value: 'dark', text: 'Dark (VS Code)' })])),
    el('div', { class: 'hint', text: 'The developer dark theme is the only supported appearance. Your OS-level preference does not affect the app.' }),
  ]));
}
