import { el, clear, toast, timeAgo, escapeHtml } from '../ui.js';
import { api } from '../api.js';
import { state, set } from '../state.js';

let projectListEl = null;

export function renderSidebar() {
  const brand = el('div', { class: 'sidebar-head', text: state.settings.appName || 'EMAIL STUDIO' });

  const newBtn = el('button', { class: 'nav-item' }, [
    el('span', { class: 'nav-icon', text: '+' }),
    el('span', { text: 'New project' }),
  ]);
  newBtn.addEventListener('click', () => newProjectDialog());

  const projectsSection = el('div', { class: 'sidebar-section-title', text: 'Projects' });
  projectListEl = el('div', { class: 'sidebar-nav' });
  const navProjects = el('button', { class: 'nav-item', 'data-view': 'projects', onclick: () => { location.hash = '#projects'; } }, [
    el('span', { class: 'nav-icon', text: '≡' }),
    el('span', { text: 'All projects' }),
    el('span', { class: 'nav-count', text: String(state.projects.length) }),
  ]);
  renderProjectList();

  const lib = el('button', { class: 'nav-item', 'data-view': 'templates', onclick: () => { location.hash = '#templates'; } }, [
    el('span', { class: 'nav-icon', text: '▤' }),
    el('span', { text: 'Templates' }),
  ]);
  const assets = el('button', { class: 'nav-item', 'data-view': 'assets', onclick: () => { location.hash = '#assets'; } }, [
    el('span', { class: 'nav-icon', text: '◫' }),
    el('span', { text: 'Assets' }),
  ]);
  const history = el('button', { class: 'nav-item', 'data-view': 'history', onclick: () => { location.hash = '#history'; } }, [
    el('span', { class: 'nav-icon', text: '↺' }),
    el('span', { text: 'History' }),
  ]);
  const settings = el('button', { class: 'nav-item', 'data-view': 'settings', onclick: () => { location.hash = '#settings'; } }, [
    el('span', { class: 'nav-icon', text: '⚙' }),
    el('span', { text: 'Settings' }),
  ]);

  const librarySection = el('div', { class: 'sidebar-section-title', text: 'Library' });

  const nav = el('div', { class: 'sidebar-nav', style: 'flex:0 0 auto' }, [
    newBtn,
    projectsSection,
    navProjects,
    projectListEl,
    librarySection,
    lib,
    assets,
    history,
    settings,
  ]);

  const username = (state.user && state.user.username) || 'admin';
  const footer = el('div', { class: 'sidebar-footer' }, [
    el('div', { class: 'user-row' }, [
      el('div', { class: 'avatar', text: username.slice(0, 1).toUpperCase() }),
      el('span', { text: username }),
      el('button', { class: 'logout', title: 'Sign out', text: '⏻', onclick: () => logout() }),
    ]),
  ]);

  return el('aside', { class: 'sidebar' }, [brand, nav, footer]);
}

function renderProjectList() {
  if (!projectListEl) return;
  clear(projectListEl);
  const items = state.projects.slice(0, 200);
  for (const p of items) {
    const name = el('span', { text: p.name });
    const btn = el('button', { class: 'nav-item' + (state.project && state.project.id === p.id ? ' active' : ''), 'data-view': 'workspace', onclick: () => { location.hash = `#workspace/${p.id}`; } }, [name]);
    btn.title = p.name;
    projectListEl.append(btn);
  }
  if (!items.length) {
    projectListEl.append(el('div', { class: 'empty-state', text: 'No projects yet', style: 'padding:12px' }));
  }
}

export function refreshSidebar() {
  renderProjectList();
}

export async function newProjectDialog() {
  const templates = state.templates.length
    ? state.templates
    : await import('../actions.js').then((m) => m.loadTemplates());

  const body = el('div', { class: 'modal-body' });
  const nameInput = el('input', { type: 'text', placeholder: 'My campaign', value: 'Untitled email' });
  body.append(el('div', { class: 'field' }, [el('label', { text: 'Project name' }), nameInput]));
  body.append(el('div', { class: 'hint', style: 'margin-bottom:10px', text: 'Or start from a starter template:' }));
  const grid = el('div', { class: 'template-grid' });
  for (const t of templates) {
    const card = el('div', { class: 'template-card', onclick: async () => {
      const name = nameInput.value.trim() || t.name;
      let project;
      if (t.key === 'blank') {
        project = await createProject({ name, html: '', css: '' });
      } else {
        const res = await api.get(`/api/templates/${t.key}`);
        project = await createProject({ name, html: res.template.html, css: res.template.css });
      }
      openProjectId(project.id);
      close();
    } }, [
      el('div', { class: 'name', text: t.name }),
      el('div', { class: 'desc', text: t.description }),
    ]);
    grid.append(card);
  }
  body.append(grid);

  let close = () => {};
  const modal = new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    close = () => backdrop.remove();
    const x = el('button', { class: 'x', html: '&times;', onclick: close });
    const m = el('div', { class: 'modal wide' }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: 'Create project' }), x]),
      body,
    ]);
    backdrop.append(m);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.append(backdrop);
    resolve();
  });
  await modal;
}

export async function createProject({ name, html, css }) {
  const res = await api.post('/api/projects', { name, html, css });
  await import('../actions.js').then((m) => m.loadProjects());
  return res.project;
}

function openProjectId(id) {
  location.hash = `#workspace/${id}`;
}

async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch (_) { /* ignore */ }
  location.hash = '';
  location.reload();
}


export function setNavActive(view) {
  if (!projectListEl) return;
  const sidebar = projectListEl.closest('.sidebar');
  if (!sidebar) return;
  sidebar.querySelectorAll('.nav-item[data-view]').forEach((n) => {
    n.classList.toggle('active', n.getAttribute('data-view') === view);
  });
  // Keep the matching project item highlighted inside the workspace.
  if (view === 'workspace') {
    sidebar.querySelectorAll('.nav-item[data-view="workspace"]').forEach((n) => {
      n.classList.toggle('active', !state.project || n.textContent.trim() === state.project.name);
    });
  }
}
