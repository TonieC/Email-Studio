import { el, clear, toast, dateStr, escapeHtml } from '../ui.js';
import { state } from '../state.js';
import { loadHistory } from '../actions.js';

export function renderHistory() {
  const page = el('div', { class: 'page' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'History' }),
      el('div', { class: 'sub', text: 'Metadata for sent and failed emails. Full message bodies are not retained.' }),
    ]),
  ]);
  const wrap = el('div', { style: 'overflow:auto;border:1px solid var(--border);border-radius:6px;background:#262626' });
  page.append(head, wrap);

  if (!state.history.length) {
    wrap.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: '↺' }),
      el('div', { text: 'No sending history yet.' }),
    ]));
  } else {
    const tbl = el('table', { class: 'tbl' });
    const thead = el('tr', {}, ['Status', 'Project', 'To', 'Subject', 'Provider', 'Type', 'Time'].map((t) => el('th', { text: t })));
    tbl.append(el('thead', {}, [thead]));
    const tbody = el('tbody');
    for (const h of state.history) {
      const status = el('span', { class: `status-badge ${h.status}`, text: h.status });
      const provider = el('span', { class: 'badge ' + (h.provider === 'gmail' ? 'gmail' : 'smtp'), text: h.provider || '—' });
      const row = el('tr', {}, [
        el('td', {}, [status]),
        el('td', { text: h.project_name || '—' }),
        el('td', { text: h.to_addr }),
        el('td', { text: h.subject || '—', style: 'max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }),
        el('td', {}, [provider]),
        el('td', { text: h.kind === 'test' ? 'test' : 'email' }),
        el('td', { text: dateStr(h.sent_at) }),
      ]);
      if (h.error) {
        const errRow = el('tr', {}, [
          el('td', { colspan: '7' }),
        ]);
        errRow.querySelector('td').append(el('span', { class: 'error-text', style: 'font-size:12px', text: 'Error: ' + h.error }));
        tbody.append(row, errRow);
      } else {
        tbody.append(row);
      }
    }
    tbl.append(tbody);
    wrap.append(tbl);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}
