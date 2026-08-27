import { el, clear, toast } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { createProject } from './sidebar.js';
import { loadTemplates } from '../actions.js';

export function renderTemplates() {
  const page = el('div', { class: 'page' });
  const grid = el('div', { class: 'template-grid' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Templates' }),
      el('div', { class: 'sub', text: 'Starter templates you can use or customize.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn primary', text: '+ Save current project as template', onclick: () => saveAsTemplate() }),
    ]),
  ]);
  page.append(head, grid);

  for (const t of state.templates) {
    const card = el('div', { class: 'template-card' }, [
      el('div', { class: 'name', text: t.name }),
      el('div', { class: 'desc', text: t.description }),
      el('div', { style: 'display:flex;gap:6px' }, [
        el('button', { class: 'btn small', text: 'Preview', onclick: () => previewTemplate(t) }),
        el('button', { class: 'btn small primary', text: 'Use template', onclick: () => useTemplate(t) }),
        t.key.startsWith('custom-') ? el('button', { class: 'btn small danger', text: '✕', onclick: () => deleteTemplate(t) }) : null,
      ]),
    ]);
    grid.append(card);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

async function useTemplate(t) {
  try {
    const res = await api.get(`/api/templates/${t.key}`);
    const project = await createProject({ name: res.template.name, html: res.template.html, css: res.template.css });
    toast('Project created from template', 'success');
    location.hash = `#workspace/${project.id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteTemplate(t) {
  try {
    await api.del(`/api/templates/${t.key}`);
    toast('Template deleted', 'info');
    await loadTemplates();
    renderTemplates();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function previewTemplate(t) {
  const iframe = el('iframe', { class: 'preview-frame', style: 'width:100%;height:400px;border:1px solid #333;border-radius:4px;background:#fff', sandbox: 'allow-same-origin' });
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'hint', style: 'margin-bottom:8px', text: t.name }),
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
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'field' }, [el('label', { text: 'Template name' }), nameInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Description' }), descInput]),
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
      });
      toast('Template saved', 'success');
      close();
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
