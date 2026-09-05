import { el, clear, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { createProject } from './sidebar.js';
import { loadTemplates } from '../actions.js';

const filters = { q: '', category: '' };

export function renderTemplates() {
  const page = el('div', { class: 'page' });
  const grid = el('div', { class: 'template-grid' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Templates' }),
      el('div', { class: 'sub', text: 'Starter templates you can use, duplicate, or customize.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn primary', text: '+ Save current project as template', onclick: () => saveAsTemplate() }),
    ]),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Search templates…', value: filters.q, 'aria-label': 'Search templates' });
  search.oninput = debounce(async () => {
    filters.q = search.value.trim();
    await loadTemplates({ q: filters.q, category: filters.category });
    renderTemplates();
  }, 200);
  const cats = ['', ...(state.templateCategories || [])];
  const cat = el('select', { 'aria-label': 'Category' }, cats.map((c) => el('option', { value: c, text: c || 'All categories' })));
  cat.value = filters.category;
  cat.onchange = async () => {
    filters.category = cat.value;
    await loadTemplates({ q: filters.q, category: filters.category });
    renderTemplates();
  };
  page.append(head, el('div', { class: 'filter-bar' }, [search, cat]), grid);

  const list = state.templates || [];
  if (!list.length) {
    grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: 'Templates' }),
      el('div', { text: 'No templates match these filters.' }),
    ]));
  } else {
    for (const t of list) {
      const card = el('div', { class: 'template-card' }, [
        el('div', { class: 'name', text: t.name }),
        el('div', { class: 'desc', text: t.description }),
        el('div', { class: 'chip-row' }, [
          el('span', { class: 'chip', text: t.category || 'custom' }),
          ...(t.tags || []).slice(0, 3).map((tag) => el('span', { class: 'chip', text: tag })),
        ]),
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
          el('button', { class: 'btn small', text: 'Preview', onclick: () => previewTemplate(t) }),
          el('button', { class: 'btn small primary', text: 'Use template', onclick: () => useTemplate(t) }),
          el('button', { class: 'btn small', text: 'Duplicate', onclick: () => duplicateTemplate(t) }),
          t.key.startsWith('custom-') ? el('button', { class: 'btn small danger', text: 'Delete', onclick: () => deleteTemplate(t) }) : null,
        ]),
      ]);
      grid.append(card);
    }
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

async function useTemplate(t) {
  try {
    const res = await api.post(`/api/templates/${t.key}/use`);
    toast('Project created from template', 'success');
    location.hash = `#workspace/${res.project.id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function duplicateTemplate(t) {
  try {
    await api.post(`/api/templates/${t.key}/duplicate`);
    toast('Template duplicated', 'success');
    await loadTemplates({ q: filters.q, category: filters.category });
    renderTemplates();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteTemplate(t) {
  const ok = await confirmDialog('Delete template', `Delete "${t.name}"?`);
  if (!ok) return;
  try {
    await api.del(`/api/templates/${t.key}`);
    toast('Template deleted', 'info');
    await loadTemplates({ q: filters.q, category: filters.category });
    renderTemplates();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function previewTemplate(t) {
  const iframe = el('iframe', { class: 'preview-frame', style: 'width:100%;height:400px;border:1px solid #333;border-radius:4px;background:#fff', sandbox: 'allow-same-origin', title: t.name });
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'hint', style: 'margin-bottom:8px', text: t.description || t.name }),
    iframe,
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn primary', text: 'Use template', onclick: () => { useTemplate(t); close(); } }),
    el('button', { class: 'btn', text: 'Close', onclick: () => close() }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  const modal = el('div', { class: 'modal wide' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: t.name }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  api.get(`/api/templates/${t.key}`).then((res) => {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${res.template.css || ''}</style></head><body>${res.template.html || ''}</body></html>`;
    iframe.srcdoc = doc;
  });
}

async function saveAsTemplate() {
  if (!state.project) { toast('Open a project first', 'warn'); return; }
  const nameInput = el('input', { type: 'text', value: state.project.name });
  const descInput = el('input', { type: 'text', placeholder: 'Short description' });
  const catInput = el('select', {}, (state.templateCategories || ['custom']).map((c) => el('option', { value: c, text: c })));
  catInput.value = 'custom';
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'field' }, [el('label', { text: 'Template name' }), nameInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Description' }), descInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Category' }), catInput]),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: 'Save template', onclick: async () => {
      const name = nameInput.value.trim();
      if (!name) { toast('Name required', 'warn'); return; }
      const key = 'custom-' + Date.now().toString(36);
      await api.post('/api/templates', {
        key,
        name,
        description: descInput.value.trim() || 'Custom template',
        html: state.project.html,
        css: state.project.css,
        category: catInput.value,
      });
      toast('Template saved', 'success');
      close();
      await loadTemplates();
      if (state.view === 'templates') renderTemplates();
    } }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Save as template' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
