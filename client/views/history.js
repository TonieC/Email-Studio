import { el, clear, toast, dateStr, confirmDialog, formatBytes } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { loadHistory } from '../actions.js';

const filters = { q: '', status: '', kind: '', accountId: '' };

export function renderHistory() {
  const page = el('div', { class: 'page' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'History' }),
      el('div', { class: 'sub', text: 'Metadata for sent and failed emails. Full message bodies are not retained.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn danger', text: 'Clear history', onclick: () => clearHistory() }),
    ]),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Search recipient, subject, project…', value: filters.q, 'aria-label': 'Search history' });
  search.oninput = debounce(async () => { filters.q = search.value.trim(); await reload(); }, 220);
  const status = el('select', { 'aria-label': 'Status' }, [
    el('option', { value: '', text: 'All statuses' }),
    el('option', { value: 'sent', text: 'Sent' }),
    el('option', { value: 'failed', text: 'Failed' }),
  ]);
  status.value = filters.status;
  status.onchange = async () => { filters.status = status.value; await reload(); };
  const kind = el('select', { 'aria-label': 'Type' }, [
    el('option', { value: '', text: 'All types' }),
    el('option', { value: 'email', text: 'Email' }),
    el('option', { value: 'test', text: 'Test' }),
  ]);
  kind.value = filters.kind;
  kind.onchange = async () => { filters.kind = kind.value; await reload(); };
  const account = el('select', { 'aria-label': 'Account' }, [
    el('option', { value: '', text: 'All accounts' }),
    ...(state.accounts || []).map((a) => el('option', { value: a.id, text: a.name })),
  ]);
  account.value = filters.accountId;
  account.onchange = async () => { filters.accountId = account.value; await reload(); };

  const wrap = el('div', { class: 'table-wrap' });
  page.append(head, el('div', { class: 'filter-bar' }, [search, status, kind, account]), wrap);

  if (!state.history.length) {
    wrap.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'History' }),
      el('div', { text: 'No sending history yet.' }),
    ]));
  } else {
    const tbl = el('table', { class: 'tbl' });
    const thead = el('tr', {}, ['Status', 'Project', 'To', 'Subject', 'Provider', 'Type', 'Size', 'Time'].map((t) => el('th', { text: t })));
    tbl.append(el('thead', {}, [thead]));
    const tbody = el('tbody');
    for (const h of state.history) {
      const statusBadge = el('span', { class: `status-badge ${h.status}`, text: h.status });
      const provider = el('span', { class: 'badge ' + (h.provider === 'gmail' ? 'gmail' : 'smtp'), text: h.provider || '—' });
      const row = el('tr', { class: 'clickable', onclick: () => showDetail(h) }, [
        el('td', {}, [statusBadge]),
        el('td', { text: h.project_name || '—' }),
        el('td', { text: h.to_addr }),
        el('td', { text: h.subject || '—', style: 'max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }),
        el('td', {}, [provider]),
        el('td', { text: h.kind === 'test' ? 'test' : 'email' }),
        el('td', { text: h.size ? formatBytes(h.size) : '—' }),
        el('td', { text: dateStr(h.sent_at) }),
      ]);
      tbody.append(row);
      if (h.error) {
        const errRow = el('tr', {}, [el('td', { colspan: '8' })]);
        errRow.querySelector('td').append(el('span', { class: 'error-text', style: 'font-size:12px', text: 'Error: ' + h.error }));
        tbody.append(errRow);
      }
    }
    tbl.append(tbody);
    wrap.append(tbl);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

async function reload() {
  await loadHistory({ q: filters.q, status: filters.status, kind: filters.kind, accountId: filters.accountId });
  renderHistory();
}

function showDetail(h) {
  const rows = [
    ['Status', h.status],
    ['Project', h.project_name || '—'],
    ['To', h.to_addr || '—'],
    ['Cc', h.cc_addr || '—'],
    ['Bcc', h.bcc_addr || '—'],
    ['From', h.from_addr || '—'],
    ['Reply-to', h.reply_to || '—'],
    ['Subject', h.subject || '—'],
    ['Provider', h.provider || '—'],
    ['Account', h.account_name || '—'],
    ['Type', h.kind || 'email'],
    ['Size', h.size ? formatBytes(h.size) : '—'],
    ['Time', dateStr(h.sent_at)],
  ];
  const body = el('div', { class: 'modal-body' });
  for (const [k, v] of rows) {
    body.append(el('div', { class: 'row', style: 'justify-content:space-between;padding:4px 0' }, [
      el('span', { class: 'muted', text: k }),
      el('span', { text: String(v) }),
    ]));
  }
  if (h.error) body.append(el('div', { class: 'error-text', style: 'margin-top:8px', text: h.error }));
  const foot = el('div', { class: 'modal-foot' }, [el('button', { class: 'btn', text: 'Close', onclick: () => close() })]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  backdrop.append(el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Send details' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]));
  document.body.append(backdrop);
}

async function clearHistory() {
  const ok = await confirmDialog('Clear history', 'Delete all send history metadata? This cannot be undone.', 'Clear', true);
  if (!ok) return;
  try {
    await api.del('/api/history');
    toast('History cleared', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
