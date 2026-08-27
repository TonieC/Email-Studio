import { api } from './api.js';
import { state, set } from './state.js';

export async function loadProjects() {
  const res = await api.get('/api/projects');
  set({ projects: res.projects });
  return res.projects;
}

export async function loadAccounts() {
  const res = await api.get('/api/accounts');
  set({ accounts: res.accounts, gmailConfigured: res.gmailConfigured });
  return res.accounts;
}

export async function loadAssets() {
  const res = await api.get('/api/assets');
  set({ assets: res.assets });
  return res.assets;
}

export async function loadTemplates() {
  const res = await api.get('/api/templates');
  set({ templates: res.templates });
  return res.templates;
}

export async function loadSettings() {
  const res = await api.get('/api/settings');
  set({ settings: res.settings, sendDefaults: res.sendDefaults, storage: res.storage });
  return res.settings;
}

export async function loadHistory(projectId) {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const res = await api.get('/api/history' + q);
  set({ history: res.history });
  return res.history;
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
