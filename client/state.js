export const state = {
  needsSetup: true,
  user: null,
  view: 'projects',
  projects: [],
  project: null,
  saveState: 'saved',
  mode: 'code',
  paneTab: 'html',
  device: 'desktop',
  generated: null,
  compatibility: [],
  accounts: [],
  gmailConfigured: false,
  assets: [],
  history: [],
  templates: [],
  settings: {},
  sendDefaults: {},
  storage: null,
  selectedElement: null,
  visualHistory: [],
  visualHistoryIndex: -1,
};

export function set(partial) {
  Object.assign(state, partial);
}
