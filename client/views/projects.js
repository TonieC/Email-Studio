import { el, clear, toast, timeAgo, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { state, set } from '../state.js';
import { loadProjects } from '../actions.js';
import { createProject } from './sidebar.js';

export function renderProjects() {
  const page = el('div', { class: 'page' });
  const listEl = el('div', { class: 'card-list' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Projects' }),
      el('div', { class: 'sub', text: 'Create, edit, convert and send HTML emails.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn', text: 'Import HTML', onclick: () => importDialog() }),
      el('button', { class: 'btn primary', text: '+ New project', onclick: () => createProjectDialog() }),
    ]),
  ]);
  page.append(head, listEl);

  renderList(listEl);

  if (!state.projects.length) {
    renderEmptyState(page);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

function renderEmptyState(page) {
  const firstRun = el('div', { class: 'empty-state', style: 'margin-top:24px' }, [
    el('div', { class: 'big', text: '✉' }),
    el('div', { style: 'font-size:14px;color:#ccc;margin-bottom:12px', text: 'Create your first project' }),
    el('div', { style: 'display:flex;gap:8px;justify-content:center' }, [
      el('button', { class: 'btn primary', text: 'Blank Email', onclick: () => createProjectFrom('blank') }),
      el('button', { class: 'btn', text: 'Welcome Email', onclick: () => createProjectFrom('welcome') }),
      el('button', { class: 'btn', text: 'Newsletter', onclick: () => createProjectFrom('newsletter') }),
    ]),
  ]);
  page.append(firstRun);
}

async function createProjectFrom(key) {
  try {
    let project;
    if (key === 'blank') {
      project = await createProject({ name: 'Untitled email', html: '', css: '' });
    } else {
      const res = await api.get(`/api/templates/${key}`);
      project = await createProject({ name: res.template.name, html: res.template.html, css: res.template.css });
    }
    location.hash = `#workspace/${project.id}`;
  } catch (e) {
    toast(`Failed: ${e.message}`, 'error');
  }
}

function renderList(listEl) {
  clear(listEl);
  for (const p of state.projects) {
    const item = el('div', { class: 'card-list-item' }, [
      el('div', { class: 'body', onclick: () => { location.hash = `#workspace/${p.id}`; } }, [
        el('div', { class: 'name', text: p.name }),
        el('div', { class: 'meta', text: `Updated ${timeAgo(p.updated_at)}` }),
      ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn icon small', title: 'Open', text: '↗', onclick: () => { location.hash = `#workspace/${p.id}`; } }),
        el('button', { class: 'btn icon small', title: 'Duplicate', text: '⧉', onclick: () => duplicateProject(p) }),
        el('button', { class: 'btn icon small', title: 'Export', text: '↓', onclick: () => exportProject(p) }),
        el('button', { class: 'btn icon small danger', title: 'Delete', text: '✕', onclick: () => deleteProject(p) }),
      ]),
    ]);
    listEl.append(item);
  }
}

async function duplicateProject(p) {
  try {
    const res = await api.post(`/api/projects/${p.id}/duplicate`);
    toast(`Duplicated as "${res.project.name}"`, 'success');
    await loadProjects();
    refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteProject(p) {
  const ok = await confirmDialog('Delete project', `Delete "${p.name}"? This cannot be undone.`);
  if (!ok) return;
  try {
    await api.del(`/api/projects/${p.id}`);
    toast('Project deleted', 'info');
    await loadProjects();
    refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function exportProject(p) {
  try {
    const a = el('a', { href: `/api/projects/${p.id}/export?format=zip` });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Exporting project as ZIP', 'info');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function importDialog() {
  const fileInput = el('input', { type: 'file', accept: '.html,.htm,text/html', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let html = text;
      let css = '';
      const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        css = styleMatch[1];
        html = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/?head[^>]*>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
        const htmlMatch = text.match(/<html[^>]*>([\s\S]*)<\/html>/i);
        if (htmlMatch) {
          const headMatch = htmlMatch[1].match(/<head[^>]*>[\s\S]*?<\/head>/i);
          if (headMatch) {
            const bodyMatch = htmlMatch[1].match(/<body[^>]*>([\s\S]*)<\/body>/i);
            html = bodyMatch ? bodyMatch[1].trim() : html;
          }
        }
      }
      const name = file.name.replace(/\.(html?)$/i, '') || 'Imported email';
      const project = await createProject({ name, html, css });
      toast('Project imported', 'success');
      location.hash = `#workspace/${project.id}`;
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error');
    }
  });
  fileInput.click();
}

async function createProjectDialog() {
  const nameInput = el('input', { type: 'text', placeholder: 'Campaign name', value: 'Untitled email' });
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'field' }, [el('label', { text: 'Project name' }), nameInput]),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel' }),
    el('button', { class: 'btn primary', text: 'Create' }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  foot.querySelectorAll('button')[0].addEventListener('click', close);
  foot.querySelectorAll('button')[1].addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Untitled email';
    try {
      const project = await createProject({ name, html: '', css: '' });
      close();
      location.hash = `#workspace/${project.id}`;
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'New project' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  nameInput.focus();
}

export function refresh() {
  if (state.view === 'projects') renderProjects();
}
