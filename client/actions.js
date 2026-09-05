import { api } from './api.js';
import { state, set } from './state.js';

export async function loadProjects(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) q.set(k, v);
  const res = await api.get('/api/projects' + (q.toString() ? '?' + q.toString() : ''));
  set({ projects: res.projects, folders: res.folders || state.folders || [] });
  return res.projects;
}

export async function loadAccounts() {
  const res = await api.get('/api/accounts');
  set({ accounts: res.accounts, gmailConfigured: res.gmailConfigured });
  return res.accounts;
}

export async function loadAssets(params = {}) {
  const q = new URLSearchParams(params);
  const res = await api.get('/api/assets' + (q.toString() ? '?' + q.toString() : ''));
  set({ assets: res.assets });
  return res.assets;
}

export async function loadTemplates(params = {}) {
  const q = new URLSearchParams(params);
  const res = await api.get('/api/templates' + (q.toString() ? '?' + q.toString() : ''));
  set({ templates: res.templates, templateCategories: res.categories || [] });
  return res.templates;
}

export async function loadSettings() {
  const res = await api.get('/api/settings');
  set({ settings: res.settings, sendDefaults: res.sendDefaults, storage: res.storage });
  return res.settings;
}

export async function loadHistory(params = {}) {
  const q = new URLSearchParams();
  if (typeof params === 'string') q.set('projectId', params);
  else for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const res = await api.get('/api/history' + (q.toString() ? '?' + q.toString() : ''));
  set({ history: res.history });
  return res.history;
}

export async function loadContacts(params = {}) {
  const q = new URLSearchParams(params);
  const res = await api.get('/api/contacts' + (q.toString() ? '?' + q.toString() : ''));
  set({ contacts: res.contacts || [] });
  return res.contacts;
}

export async function loadScheduled() {
  const res = await api.get('/api/schedule');
  set({ scheduled: res.scheduled || [] });
  return res.scheduled;
}

export function refreshSidebar() {
  if (state.refreshSidebar) state.refreshSidebar();
}

export function refreshHistory() {
  if (state.refreshHistory) state.refreshHistory();
}

export function refreshAssets() {
  if (state.refreshAssets) state.refreshAssets();
}
