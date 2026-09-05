import './styles.css';
import { el, clear, toast } from './ui.js';
import { api, setCsrf } from './api.js';
import { state, set } from './state.js';
import { renderSetup, renderLogin } from './views/auth.js';
import { renderSidebar, refreshSidebar, setNavActive } from './views/sidebar.js';
import { renderProjects } from './views/projects.js';
import { renderTemplates } from './views/templates.js';
import { renderAssets } from './views/assets.js';
import { renderHistory } from './views/history.js';
import { renderContacts } from './views/contacts.js';
import { renderSettings } from './views/settings.js';
import { renderWorkspace, teardownWorkspace } from './views/workspace.js';
import { loadProjects, loadAccounts, loadAssets, loadTemplates, loadSettings, loadHistory, loadContacts } from './actions.js';

const root = () => document.getElementById('app');

function renderShell() {
  const app = root();
  clear(app);
  const main = el('div', { class: 'main' });
  state.mainEl = main;
  state.shellEl = el('div', { class: 'app-root' }, [renderSidebar(), main]);
  app.append(state.shellEl);
  state.refreshSidebar = refreshSidebar;
  state.refreshAssets = () => { if (state.view === 'assets') renderAssets(); };
  state.refreshHistory = () => { if (state.view === 'history') loadHistory().then(() => renderHistory()); };
}

async function bootstrap() {
  const boot = await api.get('/api/auth/bootstrap');
  if (boot.csrf) setCsrf(boot.csrf);
  set({ needsSetup: boot.needsSetup, user: boot.user });
}

async function route() {
  const hash = location.hash || '#projects';
  const [path, id] = hash.slice(1).split('/');

  if (state.view === 'workspace') teardownWorkspace();
  set({ view: path || 'projects', selectedElement: null });

  if (path === 'projects') {
    await renderProjects();
  } else if (path === 'workspace') {
    await openWorkspace(id);
  } else if (path === 'templates') {
    await loadTemplates();
    renderTemplates();
  } else if (path === 'assets') {
    await loadAssets();
    renderAssets();
  } else if (path === 'history') {
    await loadHistory();
    renderHistory();
  } else if (path === 'contacts') {
    await loadContacts();
    renderContacts();
  } else if (path === 'settings') {
    await loadAccounts();
    await loadSettings();
    renderSettings();
  } else {
    location.hash = '#projects';
    return;
  }
  setNavActive(path);
}

async function openWorkspace(id) {
  try {
    const res = await api.get(`/api/projects/${id}`);
    set({ project: res.project, generated: null, compatibility: [], selectedElement: null, visualHistory: [], visualHistoryIndex: -1 });
    renderWorkspace();
  } catch (e) {
    toast(`Could not open project: ${e.message}`, 'error');
    location.hash = '#projects';
  }
}

function handleFlash() {
  const params = new URLSearchParams(location.search);
  const flash = params.get('flash');
  const type = params.get('flash_type') || 'info';
  if (flash) {
    toast(flash, type === 'error' ? 'error' : 'success', 6000);
    const url = new URL(location.href);
    url.searchParams.delete('flash');
    url.searchParams.delete('flash_type');
    history.replaceState(null, '', url.toString());
  }
}

async function init() {
  try {
    await bootstrap();
  } catch (e) {
    clear(root());
    root().append(el('div', { class: 'auth-screen' }, [el('div', { class: 'auth-card', style: 'color:#f85149' }, [
      el('div', { text: 'Failed to reach the server.' }),
      el('div', { class: 'hint', text: e.message }),
    ])]));
    return;
  }

  if (state.needsSetup) {
    clear(root());
    root().append(renderSetup());
    return;
  }
  if (!state.user) {
    clear(root());
    root().append(renderLogin());
    return;
  }

  try {
    await Promise.all([loadProjects(), loadAccounts(), loadAssets(), loadTemplates(), loadSettings(), loadHistory(), loadContacts()]);
  } catch (e) {
    toast(`Failed to load data: ${e.message}`, 'error');
  }

  renderShell();
  handleFlash();
  await route();
  window.addEventListener('hashchange', route);
}

init();
