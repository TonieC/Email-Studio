import { el, clear, toast, confirmDialog, timeAgo } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { loadContacts } from '../actions.js';

const filters = { q: '', tag: '' };

export function renderContacts() {
  const page = el('div', { class: 'page' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Contacts' }),
      el('div', { class: 'sub', text: 'Merge fields like {{first_name}} are replaced when sending.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn', text: 'Export CSV', onclick: () => exportCsv() }),
      el('button', { class: 'btn', text: 'Import CSV', onclick: () => importCsv() }),
      el('button', { class: 'btn primary', text: '+ Add contact', onclick: () => contactForm(null) }),
    ]),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Search contacts…', value: filters.q, 'aria-label': 'Search contacts' });
  search.oninput = debounce(async () => { filters.q = search.value.trim(); await reload(); }, 200);
  const tags = uniqueTags();
  const tag = el('select', { 'aria-label': 'Tag' }, [
    el('option', { value: '', text: 'All tags' }),
    ...tags.map((t) => el('option', { value: t, text: t })),
  ]);
  tag.value = filters.tag;
  tag.onchange = async () => { filters.tag = tag.value; await reload(); };
  const wrap = el('div', { class: 'table-wrap' });
  page.append(head, el('div', { class: 'filter-bar' }, [search, tag]), wrap);

  if (!(state.contacts || []).length) {
    wrap.append(el('div', { class: 'empty-state' }, [
      el('div', { class: 'big', text: 'Contacts' }),
      el('div', { text: 'No contacts yet. Add one or import a CSV.' }),
    ]));
  } else {
    const tbl = el('table', { class: 'tbl' });
    tbl.append(el('thead', {}, [el('tr', {}, ['Name', 'Email', 'Company', 'Tags', 'Updated', ''].map((t) => el('th', { text: t })))]));
    const tbody = el('tbody');
    for (const c of state.contacts) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
      tbody.append(el('tr', {}, [
        el('td', { text: name }),
        el('td', { text: c.email }),
        el('td', { text: c.company || '—' }),
        el('td', {}, (c.tags || []).map((t) => el('span', { class: 'chip', text: t }))),
        el('td', { text: timeAgo(c.updated_at) }),
        el('td', {}, [
          el('button', { class: 'btn small', text: 'Edit', onclick: () => contactForm(c) }),
          el('button', { class: 'btn small danger', text: 'Delete', onclick: () => removeContact(c) }),
        ]),
      ]));
    }
    tbl.append(tbody);
    wrap.append(tbl);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

function uniqueTags() {
  const set = new Set();
  for (const c of state.contacts || []) for (const t of c.tags || []) set.add(t);
  return [...set].sort();
}

async function reload() {
  await loadContacts({ q: filters.q, tag: filters.tag });
  renderContacts();
}

function contactForm(existing) {
  const email = el('input', { type: 'email', value: existing ? existing.email : '', placeholder: 'person@example.com' });
  const first = el('input', { type: 'text', value: existing ? existing.first_name : '', placeholder: 'First name' });
  const last = el('input', { type: 'text', value: existing ? existing.last_name : '', placeholder: 'Last name' });
  const company = el('input', { type: 'text', value: existing ? existing.company : '', placeholder: 'Company' });
  const tags = el('input', { type: 'text', value: existing && existing.tags ? existing.tags.join(', ') : '', placeholder: 'vip, newsletter' });
  const body = el('div', { class: 'modal-body' }, [
    field('Email', email),
    field('First name', first),
    field('Last name', last),
    field('Company', company),
    field('Tags', tags),
    el('div', { class: 'hint', text: 'Use {{first_name}}, {{last_name}}, {{email}}, {{company}} in HTML.' }),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: existing ? 'Save' : 'Add', onclick: async () => {
      const payload = {
        email: email.value,
        first_name: first.value,
        last_name: last.value,
        company: company.value,
        tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      };
      try {
        if (existing) await api.put(`/api/contacts/${existing.id}`, payload);
        else await api.post('/api/contacts', payload);
        toast(existing ? 'Contact updated' : 'Contact added', 'success');
        close();
        await reload();
      } catch (e) {
        toast(e.message, 'error');
      }
    } }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  backdrop.append(el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: existing ? 'Edit contact' : 'Add contact' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]));
  document.body.append(backdrop);
  email.focus();
}

function field(label, input) {
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

async function removeContact(c) {
  const ok = await confirmDialog('Delete contact', `Delete "${c.email}"?`);
  if (!ok) return;
  try {
    await api.del(`/api/contacts/${c.id}`);
    toast('Contact deleted', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function exportCsv() {
  const a = el('a', { href: '/api/contacts/export' });
  document.body.append(a);
  a.click();
  a.remove();
  toast('Exporting contacts', 'info');
}

function importCsv() {
  const input = el('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const csv = await file.text();
      const res = await api.post('/api/contacts/import', { csv });
      toast(`Imported ${res.imported} contact(s)` + (res.errors && res.errors.length ? `; ${res.errors.length} error(s)` : ''), res.errors && res.errors.length ? 'warn' : 'success');
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  input.click();
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
