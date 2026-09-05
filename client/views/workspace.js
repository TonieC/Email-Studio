import { el, clear, toast, copyText, downloadFile, formatBytes } from '../ui.js';
import { api } from '../api.js';
import { state, set } from '../state.js';
import { createEditor, setValue, formatDoc } from '../editor.js';
import {
  initVisual, destroyVisual, buildDoc, buildInspector, buildPalette, serializeCurrent,
  undoVisual, redoVisual, insertBlockHtml, duplicateSelected, deleteSelected, pushSnapshot,
} from './visual.js';
import { refreshSidebar, refreshHistory, loadContacts } from '../actions.js';

let htmlEditor = null;
let cssEditor = null;
let previewTimer = null;
let visualHandle = null;
let visualKeyHandler = null;
let globalKeyHandler = null;
let formatter = null;
let saveTimer = null;
let crashKey = null;

const DEVICE_SIZES = { desktop: 600, tablet: 768, mobile: 375 };

async function loadPrettier() {
  if (formatter) return formatter;
  try {
    const standalone = await import('prettier/standalone');
    const htmlPlugin = await import('prettier/plugins/html');
    const cssPlugin = await import('prettier/plugins/postcss').catch(() => null);
    formatter = async (source, language) =>
      standalone.format(source, {
        parser: language,
        plugins: cssPlugin ? [htmlPlugin, cssPlugin] : [htmlPlugin],
        htmlWhitespaceSensitivity: 'ignore',
        tabWidth: 2,
        printWidth: 120,
      });
  } catch (e) {
    formatter = async (source, language) => {
      const res = await api.post('/api/format', { source, language });
      return res.formatted;
    };
  }
  return formatter;
}

function crashStorageKey() {
  return state.project ? `es-crash-${state.project.id}` : null;
}

function persistCrashDraft() {
  try {
    const key = crashStorageKey();
    if (!key || !state.project) return;
    localStorage.setItem(key, JSON.stringify({
      html: state.project.html,
      css: state.project.css,
      name: state.project.name,
      ts: Date.now(),
    }));
  } catch (_) { /* ignore */ }
}

function restoreCrashDraft() {
  try {
    const key = crashStorageKey();
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function renderWorkspace() {
  crashKey = crashStorageKey();
  const draft = restoreCrashDraft();
  if (draft && draft.ts && Date.now() - draft.ts < 24 * 3600 * 1000 && draft.html && draft.html !== (state.project.html || '')) {
    if (window.confirm('A crash draft was found for this project. Restore it?')) {
      state.project.html = draft.html;
      state.project.css = draft.css || state.project.css;
    }
  }

  const elProjectName = el('span', { class: 'project-name editable', text: state.project ? state.project.name : '', contenteditable: 'true' });
  const elSave = el('span', { class: 'save-status', text: 'Saved' });
  const elCompat = el('span', { class: 'compat-indicator' });
  const elCenter = el('div', { class: 'pane-center' });
  const elPreview = el('div', { class: 'pane-preview' });
  const elWorkspace = el('div', { class: 'workspace' }, [elCenter, elPreview]);

  const topbar = el('div', { class: 'topbar' }, [
    elProjectName,
    elSave,
    el('div', { class: 'topbar-spacer' }),
    el('button', { class: 'btn', text: 'Doctor', onclick: () => runDoctor() }),
    el('button', { class: 'btn', text: 'Format', onclick: () => formatAll() }),
    el('button', { class: 'btn', text: 'Convert', onclick: () => convert() }),
    el('button', { class: 'btn', text: 'Test send', onclick: () => openSendModal('test') }),
    el('button', { class: 'btn', text: 'Download ZIP', onclick: () => downloadZip() }),
    el('button', { class: 'btn primary', text: 'Send', onclick: () => openSendModal('email') }),
  ]);

  const modeTabs = el('div', { class: 'mode-tabs' }, [
    el('button', { class: 'mode-tab', text: 'Code', onclick: () => setMode('code') }),
    el('button', { class: 'mode-tab', text: 'Visual', onclick: () => setMode('visual') }),
    el('button', { class: 'mode-tab', text: 'Output', onclick: () => setMode('output') }),
    el('button', { class: 'mode-tab', text: 'Meta', onclick: () => setMode('meta') }),
    el('div', { class: 'topbar-spacer' }),
    elCompat,
  ]);

  const content = el('div', { class: 'main', style: 'height:100%;display:flex;flex-direction:column' }, [topbar, modeTabs, elWorkspace]);
  clear(state.mainEl);
  state.mainEl.append(content);

  state.workspaceEls = { elProjectName, elSave, elCompat, elCenter, elPreview, modeTabs };

  elProjectName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); elProjectName.blur(); }
    e.stopPropagation();
  });
  elProjectName.addEventListener('blur', async () => {
    const name = elProjectName.textContent.trim();
    if (name && name !== state.project.name) {
      state.project.name = name;
      scheduleSave();
      refreshSidebar();
    }
    if (!name) elProjectName.textContent = state.project.name;
  });

  if (!htmlEditor) {
    const shell = buildCodePanes();
    elCenter.append(shell);
    htmlEditor = createEditor({
      parent: state.codeShellEls.htmlParent,
      value: state.project.html,
      language: 'html',
      onChange: (v) => { state.project.html = v; markDirty(); },
      onSave: () => doSave(true),
      onFormat: () => formatAll(),
    });
    cssEditor = createEditor({
      parent: state.codeShellEls.cssParent,
      value: state.project.css,
      language: 'css',
      onChange: (v) => { state.project.css = v; markDirty(); },
      onSave: () => doSave(true),
      onFormat: () => formatAll(),
    });
    loadPrettier();
  } else {
    setValue(htmlEditor, state.project.html);
    setValue(cssEditor, state.project.css);
  }

  renderPreviewNow();
  setMode(state.mode || 'code');
  renderSaveStatus();
  loadVersionsQuiet();

  visualKeyHandler = (e) => {
    if (state.mode !== 'visual') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoVisual(); else undoVisual();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoVisual();
    }
  };
  document.addEventListener('keydown', visualKeyHandler);
  globalKeyHandler = (e) => onGlobalKeys(e);
  document.addEventListener('keydown', globalKeyHandler);
}

function buildCodePanes() {
  const htmlPane = el('div', { class: 'code-pane' }, [
    el('div', { class: 'code-pane-head' }, [
      el('span', { class: 'dot', style: 'background:#e34c26' }),
      el('span', { text: 'index.html' }),
      el('div', { class: 'topbar-spacer' }),
      el('button', { class: 'btn small', text: 'Find', onclick: () => htmlEditor && htmlEditor.focus() }),
    ]),
    el('div', { class: 'code-shell' }),
  ]);
  const cssPane = el('div', { class: 'code-pane' }, [
    el('div', { class: 'code-pane-head' }, [
      el('span', { class: 'dot', style: 'background:#563d7c' }),
      el('span', { text: 'style.css' }),
    ]),
    el('div', { class: 'code-shell' }),
  ]);
  state.codeShellEls = {
    htmlParent: htmlPane.querySelector('.code-shell'),
    cssParent: cssPane.querySelector('.code-shell'),
  };
  return el('div', { class: 'code-split' }, [htmlPane, cssPane]);
}

function markDirty() {
  set({ saveState: 'unsaved' });
  renderSaveStatus();
  scheduleSave();
  schedulePreview();
  persistCrashDraft();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveState: 'saving' });
  renderSaveStatus();
  saveTimer = setTimeout(doSave, 900);
}

export async function doSave(fromShortcut) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!state.project) return;
  if (fromShortcut && state.formatOnSave) {
    try { await formatAll(true); } catch (_) { /* ignore */ }
  }
  const project = state.project;
  try {
    const res = await api.put(`/api/projects/${project.id}`, {
      name: project.name,
      html: project.html,
      css: project.css,
      subject: project.subject,
      preheader: project.preheader,
      from_name: project.from_name,
      reply_to: project.reply_to,
      to_addr: project.to_addr,
      cc_addr: project.cc_addr,
      bcc_addr: project.bcc_addr,
      visual_json: project.visual_json,
      tags: project.tags,
    });
    state.project = Object.assign(state.project, res.project);
    set({ saveState: 'saved' });
    renderSaveStatus();
    refreshSidebar();
    try { localStorage.removeItem(crashStorageKey()); } catch (_) { /* ignore */ }
  } catch (e) {
    set({ saveState: 'unsaved' });
    renderSaveStatus();
    toast(`Save failed: ${e.message}`, 'error');
  }
}

function renderSaveStatus() {
  if (!state.workspaceEls) return;
  const node = state.workspaceEls.elSave;
  node.className = 'save-status ' + state.saveState;
  node.textContent = state.saveState === 'saved' ? 'Saved' : state.saveState === 'saving' ? 'Saving…' : 'Unsaved';
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreviewNow, 250);
}

export function currentDocSource() {
  const { html, css } = state.project;
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style>${css || ''}</style>`);
    }
    return html;
  }
  return buildDoc({ html, css });
}

function currentDocForMode() {
  if (state.mode === 'output' && state.generated) {
    if (state.outputView === 'minified') return state.generated.minified || state.generated.html;
    if (state.outputView === 'original') return currentDocSource();
    return state.generated.html;
  }
  return currentDocSource();
}

function previewWidth() {
  if (state.device === 'custom') return parseInt(state.customWidth, 10) || 600;
  return DEVICE_SIZES[state.device] || 600;
}

const CLIENT_SKINS = {
  none: { name: 'Plain', chrome: null },
  gmail: { name: 'Gmail', bg: '#fff', bar: '#f2f2f2', title: 'Inbox' },
  outlook: { name: 'Outlook', bg: '#f3f2f1', bar: '#0078d4', title: 'Outlook' },
  apple: { name: 'Apple Mail', bg: '#f5f5f7', bar: '#e8e8ed', title: 'Mail' },
  yahoo: { name: 'Yahoo', bg: '#fff', bar: '#6001d2', title: 'Yahoo Mail' },
};

export function renderPreviewNow() {
  if (!state.workspaceEls) return;
  const { elPreview } = state.workspaceEls;
  clear(elPreview);
  const width = previewWidth();
  const zoom = state.zoom || 1;
  const skin = CLIENT_SKINS[state.clientSkin] || CLIENT_SKINS.none;

  const devices = ['desktop', 'tablet', 'mobile', 'custom'].map((d) =>
    el('button', { class: state.device === d ? 'active' : '', text: d[0].toUpperCase() + d.slice(1), onclick: () => setDevice(d) }));

  const head = el('div', { class: 'preview-head' }, [
    el('span', { class: 'title', text: state.mode === 'output' && state.generated ? 'Generated email' : 'Live preview' }),
    el('div', { class: 'device-toggle' }, devices),
    el('button', { class: 'btn small', text: zoom === 1 ? '100%' : Math.round(zoom * 100) + '%', onclick: () => cycleZoom() }),
    el('button', { class: 'btn small', text: 'Full', onclick: () => toggleFullscreen() }),
  ]);

  const skinBar = el('div', { class: 'client-skins' }, Object.entries(CLIENT_SKINS).map(([k, v]) =>
    el('button', { class: 'btn small' + (state.clientSkin === k ? ' primary' : ''), text: v.name, onclick: () => { set({ clientSkin: k }); renderPreviewNow(); } })));

  const note = el('div', { class: 'preview-note', text: `${width}px · ${skin.name}` });
  const wrap = el('div', { class: 'preview-frame-wrap' + (state.fullscreenPreview ? ' fullscreen' : ''), style: `width:${Math.round(width * zoom)}px` });
  if (skin.bar) {
    wrap.append(el('div', { class: 'client-chrome', style: `background:${skin.bar}`, text: inboxPreviewLine() }));
  }
  const iframe = el('iframe', {
    class: 'preview-frame',
    sandbox: 'allow-same-origin',
    title: 'Email preview',
    style: `height: 640px; width: ${width}px; transform: scale(${zoom}); transform-origin: top left;`,
  });
  wrap.append(iframe);
  const body = el('div', { class: 'preview-body' }, [wrap]);
  elPreview.append(head, skinBar, note, body);

  if (state.device === 'custom') {
    const input = el('input', { type: 'number', min: '280', max: '900', value: String(width), style: 'width:80px' });
    input.onchange = () => { set({ customWidth: parseInt(input.value, 10) || 600 }); renderPreviewNow(); };
    note.prepend(input);
  }

  iframe.srcdoc = currentDocForMode();
  iframe.onload = () => {
    if (state.mode === 'visual') {
      if (visualHandle) destroyVisual();
      visualHandle = initVisual(iframe, {
        onSelect: (info) => { state.selectedElement = info; renderInspector(); },
        onChanged: () => syncVisualChanges(),
        onToast: (msg) => toast(msg, 'success'),
      });
    }
  };
}

function inboxPreviewLine() {
  const subj = (state.project && state.project.subject) || (state.project && state.project.name) || 'Subject';
  const pre = (state.project && state.project.preheader) || '';
  return `${subj}${pre ? ' — ' + pre : ''}`;
}

function cycleZoom() {
  const next = state.zoom === 1 ? 0.75 : state.zoom === 0.75 ? 0.5 : 1;
  set({ zoom: next });
  renderPreviewNow();
}

function toggleFullscreen() {
  set({ fullscreenPreview: !state.fullscreenPreview });
  renderPreviewNow();
}

function setDevice(device) {
  set({ device });
  if (state.mode === 'visual' && visualHandle) destroyVisual();
  renderPreviewNow();
}

export function setMode(mode) {
  set({ mode });
  if (state.mode !== 'visual' && visualHandle) { destroyVisual(); visualHandle = null; }
  if (state.workspaceEls) {
    const { modeTabs } = state.workspaceEls;
    const order = ['code', 'visual', 'output', 'meta'];
    modeTabs.querySelectorAll('.mode-tab').forEach((t, i) => t.classList.toggle('active', order[i] === mode));
  }
  renderCenter();
  renderPreviewNow();
}

function renderCenter() {
  if (!state.workspaceEls) return;
  const { elCenter, elCompat } = state.workspaceEls;
  clear(elCenter);
  elCompat.innerHTML = '';
  if (state.mode === 'code') {
    elCenter.append(buildCodePanes());
    const htmlEl = elCenter.querySelectorAll('.code-shell')[0];
    const cssEl = elCenter.querySelectorAll('.code-shell')[1];
    if (htmlEditor && htmlEditor.dom.parentNode !== htmlEl) htmlEl.append(htmlEditor.dom);
    if (cssEditor && cssEditor.dom.parentNode !== cssEl) cssEl.append(cssEditor.dom);
    htmlEditor && htmlEditor.focus();
  } else if (state.mode === 'output') {
    renderOutputPane(elCenter, elCompat);
  } else if (state.mode === 'meta') {
    renderMetaPane(elCenter);
  } else {
    const split = el('div', { class: 'visual-split' });
    split.append(buildPalette((html) => insertBlockHtml(html, true)));
    const inspectorWrap = el('div', { class: 'inspector-wrap' });
    if (state.selectedElement) inspectorWrap.append(buildInspector(state.selectedElement));
    else {
      inspectorWrap.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big', text: 'Blocks' }),
        el('div', { text: 'Drag or click a block, or select an element in the preview.' }),
        el('div', { class: 'hint', style: 'margin-top:6px', text: 'Double-click text to edit. Ctrl+Z undoes.' }),
      ]));
    }
    split.append(inspectorWrap);
    elCenter.append(split);
  }
}

function renderOutputPane(elCenter, elCompat) {
  const elOut = el('div', { class: 'output-shell' });
  const tabs = el('div', { class: 'output-tabs' }, [
    el('button', { class: 'pane-tab' + (state.outputView === 'converted' ? ' active' : ''), text: 'Converted', onclick: () => switchOutputTab('converted') }),
    el('button', { class: 'pane-tab' + (state.outputView === 'original' ? ' active' : ''), text: 'Original', onclick: () => switchOutputTab('original') }),
    el('button', { class: 'pane-tab' + (state.outputView === 'minified' ? ' active' : ''), text: 'Minified', onclick: () => switchOutputTab('minified') }),
    el('div', { class: 'output-actions' }, [
      el('button', { class: 'btn small', text: 'Copy HTML', onclick: () => copyGenerated() }),
      el('button', { class: 'btn small', text: 'Download HTML', onclick: () => downloadGenerated() }),
    ]),
  ]);
  const statsEl = el('div', { class: 'convert-stats' });
  const codeEl = el('div', { class: 'output-code' });
  const section = el('div', { class: 'section-title' }, [el('span', { text: 'Compatibility' })]);
  const compatEl = el('div', { class: 'compat-list' });
  const guides = el('div', { class: 'client-guide' });
  const doctorWrap = el('div', { class: 'doctor-panel' });
  elOut.append(tabs, statsEl, codeEl, section, compatEl, guides, doctorWrap);
  elCenter.append(elOut);
  state.outputEls = { codeEl, compatEl, guides, tabs, statsEl, doctorWrap };
  renderOutputContent();
  if (state.compatibility.length) renderCompatibility(compatEl);
  renderClientGuides();
  renderDoctor(doctorWrap);
  renderConvertStats();
}

function switchOutputTab(view) {
  set({ outputView: view });
  renderOutputContent();
  renderPreviewNow();
}

function renderOutputContent() {
  if (!state.outputEls) return;
  const { codeEl, tabs } = state.outputEls;
  if (tabs) {
    tabs.querySelectorAll('.pane-tab').forEach((t) => {
      t.classList.toggle('active', t.textContent.toLowerCase() === state.outputView);
    });
  }
  if (!state.generated) {
    clear(codeEl);
    codeEl.append(el('div', { class: 'empty-state' }, [
      el('div', { text: 'No generated email yet' }),
      el('div', { class: 'hint', style: 'margin-top:6px', text: 'Click Convert to generate email-safe HTML.' }),
    ]));
    return;
  }
  let content = state.generated.html;
  if (state.outputView === 'original') content = currentDocSource();
  if (state.outputView === 'minified') content = state.generated.minified || state.generated.html;
  clear(codeEl);
  codeEl.append(el('pre', { text: content }));
}

function renderConvertStats() {
  if (!state.outputEls || !state.generated) return;
  const { statsEl } = state.outputEls;
  clear(statsEl);
  const s = state.generated.stats || {};
  statsEl.append(
    el('span', { class: 'badge', text: `Out ${formatBytes(s.sizeBytes || 0)}` }),
    el('span', { class: 'badge', text: `In ${formatBytes(s.originalBytes || 0)}` }),
    el('span', { class: 'badge', text: `${s.durationMs || 0} ms` }),
    el('span', { class: 'badge', text: `${s.tables || 0} tables` }),
  );
  for (const t of state.generated.transformations || []) {
    statsEl.append(el('span', { class: 'hint', text: t.detail }));
  }
  for (const w of state.generated.warnings || []) {
    statsEl.append(el('span', { class: 'warn-text', text: w }));
  }
}

function copyGenerated() {
  if (!state.generated) return;
  const html = state.outputView === 'minified' ? (state.generated.minified || state.generated.html) : state.generated.html;
  copyText(html).then(() => toast('Generated HTML copied', 'success')).catch(() => toast('Copy failed', 'error'));
}

function downloadGenerated() {
  if (!state.generated) return;
  const base = (state.project.name || 'email').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  downloadFile(`${base}.html`, state.generated.html, 'text/html');
  toast('Downloaded generated HTML', 'success');
}

function downloadZip() {
  if (!state.project || !state.project.id) return;
  const a = el('a', { href: `/api/projects/${state.project.id}/export?format=zip` });
  document.body.append(a);
  a.click();
  a.remove();
  toast('Exporting project as ZIP', 'info');
}

function renderCompatibility(compatEl) {
  const list = state.compatibility;
  if (!compatEl) return;
  clear(compatEl);
  if (!list || !list.length) {
    compatEl.append(el('div', { class: 'empty-state', text: 'Run Convert to check compatibility.' }));
    return;
  }
  const icons = { ok: 'OK', warn: 'WARN', info: 'INFO', error: 'ERR' };
  for (const item of list) {
    compatEl.append(el('div', { class: `compat-item ${item.level}` }, [
      el('span', { class: 'icon', text: icons[item.level] || '-' }),
      el('div', {}, [
        el('span', { text: item.message }),
        item.detail ? el('span', { class: 'detail', text: item.detail }) : null,
        item.location && item.location.line ? el('span', { class: 'detail', text: `Line ${item.location.line}` }) : null,
      ]),
    ]));
  }
}

function renderClientGuides() {
  if (!state.outputEls) return;
  const { guides } = state.outputEls;
  clear(guides);
  const clients = state.generated && state.generated.clients;
  if (!clients) return;
  for (const [key, client] of Object.entries(clients)) {
    const status = client.status || 'supported';
    const list = el('ul', {}, (client.tips || []).map((tip) => el('li', { text: tip })));
    const loc = [...(client.unsupported || []), ...(client.partial || [])]
      .map((f) => el('div', { class: 'hint', text: `${f.feature}${f.location && f.location.line ? ' @ line ' + f.location.line : ''}` }));
    guides.append(el('details', {}, [
      el('summary', {}, [
        el('span', { class: 'client-name', text: client.name }),
        el('span', { class: `badge ${status === 'supported' ? 'ok' : ''}`, text: status }),
      ]),
      list,
      loc,
    ]));
  }
}

function renderDoctor(wrap) {
  if (!wrap) return;
  clear(wrap);
  wrap.append(el('div', { class: 'section-title', text: 'Email Doctor' }));
  if (!state.doctor) {
    wrap.append(el('button', { class: 'btn', text: 'Run Email Doctor', onclick: () => runDoctor() }));
    return;
  }
  const s = state.doctor.summary || {};
  wrap.append(el('div', { class: 'hint', text: `${s.passed || 0} passed · ${s.warnings || 0} warnings · ${s.errors || 0} errors` }));
  for (const f of state.doctor.findings || []) {
    wrap.append(el('div', { class: `compat-item ${f.level === 'ok' ? 'ok' : f.level === 'error' ? 'err' : 'warn'}` }, [
      el('span', { class: 'icon', text: f.level === 'ok' ? 'OK' : f.level === 'error' ? 'ERR' : 'WARN' }),
      el('div', {}, [
        el('span', { text: f.message }),
        f.detail ? el('span', { class: 'detail', text: f.detail }) : null,
      ]),
    ]));
  }
  wrap.append(el('button', { class: 'btn primary', text: 'Apply safe fixes', onclick: () => applyDoctorFixes() }));
}

export async function runDoctor() {
  try {
    const html = state.generated ? state.generated.html : currentDocSource();
    const res = await api.post('/api/convert/doctor', { html, css: state.project.css });
    set({ doctor: res });
    setMode('output');
    toast('Email Doctor finished', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function applyDoctorFixes() {
  try {
    const res = await api.post('/api/convert/doctor/fix', { html: state.project.html, css: state.project.css });
    state.project.html = res.html;
    if (htmlEditor) setValue(htmlEditor, res.html);
    markDirty();
    toast('Applied: ' + (res.applied || []).join(', '), 'success');
    runDoctor();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderMetaPane(elCenter) {
  const p = state.project;
  const field = (label, key, placeholder) => {
    const input = el('input', { type: 'text', value: p[key] || '', placeholder });
    input.oninput = () => { p[key] = input.value; markDirty(); };
    return el('div', { class: 'field' }, [el('label', { text: label }), input]);
  };
  const box = el('div', { class: 'page', style: 'padding:16px' }, [
    el('h2', { text: 'Email metadata' }),
    field('Subject', 'subject', 'Inbox subject'),
    field('Preheader', 'preheader', 'Preview text shown after the subject'),
    field('From name', 'from_name', 'Acme'),
    field('Reply-to', 'reply_to', 'hello@example.com'),
    field('To', 'to_addr', 'recipient@example.com'),
    field('Cc', 'cc_addr', ''),
    field('Bcc', 'bcc_addr', ''),
    el('div', { class: 'inbox-preview' }, [
      el('div', { class: 'hint', text: 'Inbox preview' }),
      el('div', { class: 'name', text: inboxPreviewLine() }),
    ]),
    el('div', { class: 'section-title', text: 'Versions' }),
  ]);
  const verList = el('div', { class: 'card-list' });
  box.append(el('button', { class: 'btn', text: 'Save snapshot', onclick: () => snapshotNow() }), verList);
  elCenter.append(box);
  api.get(`/api/projects/${p.id}/versions`).then((res) => {
    set({ versions: res.versions || [] });
    for (const v of res.versions || []) {
      verList.append(el('div', { class: 'card-list-item' }, [
        el('div', { class: 'body' }, [
          el('div', { class: 'name', text: v.label || 'Snapshot' }),
          el('div', { class: 'meta', text: new Date(v.created_at).toLocaleString() }),
        ]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn small', text: 'Restore', onclick: () => restoreVersion(v.id) }),
        ]),
      ]));
    }
  }).catch(() => {});
}

async function snapshotNow() {
  await doSave();
  await api.post(`/api/projects/${state.project.id}/snapshot`, { label: 'Manual snapshot' });
  toast('Snapshot saved', 'success');
  setMode('meta');
}

async function restoreVersion(id) {
  const res = await api.post(`/api/projects/${state.project.id}/versions/${id}/restore`);
  state.project = res.project;
  if (htmlEditor) setValue(htmlEditor, res.project.html);
  if (cssEditor) setValue(cssEditor, res.project.css);
  markDirty();
  toast('Version restored', 'success');
}

async function loadVersionsQuiet() {
  try {
    const res = await api.get(`/api/projects/${state.project.id}/versions`);
    set({ versions: res.versions || [] });
  } catch (_) { /* ignore */ }
}

export async function convert() {
  const { html, css } = state.project;
  if (!html.trim()) { toast('Write some HTML first', 'warn'); return; }
  try {
    toast('Converting…', 'info');
    const res = await api.post('/api/convert', { html, css });
    state.generated = res;
    set({ compatibility: res.compatibility || [] });
    if (state.workspaceEls) {
      const { elCompat } = state.workspaceEls;
      clear(elCompat);
      const warns = (res.compatibility || []).filter((c) => c.level === 'warn').length;
      const errs = (res.compatibility || []).filter((c) => c.level === 'error').length;
      if (errs) elCompat.append(el('span', { class: 'dot err' }), el('span', { text: `${errs} error${errs > 1 ? 's' : ''}` }));
      else if (warns) elCompat.append(el('span', { class: 'dot warn' }), el('span', { text: `${warns} warning${warns > 1 ? 's' : ''}` }));
      else elCompat.append(el('span', { class: 'dot ok' }), el('span', { text: 'Clean' }));
    }
    setMode('output');
    toast(`Converted (${formatBytes(res.stats ? res.stats.sizeBytes : 0)})`, 'success');
  } catch (e) {
    toast(`Conversion failed: ${e.message}`, 'error');
  }
}

async function formatAll(silent) {
  if (state.mode !== 'code' && !silent) setMode('code');
  const fmt = await loadPrettier();
  if (htmlEditor) await formatDoc(htmlEditor, 'html', fmt);
  if (cssEditor) await formatDoc(cssEditor, 'css', fmt);
  if (!silent && (htmlEditor || cssEditor)) toast('Formatted', 'success');
}

export async function openSendModal(kind = 'email') {
  if (!state.generated) await convert();
  if (!state.generated) return;
  const accounts = state.accounts;
  if (!accounts.length) {
    toast('Add an email account in Settings first', 'warn');
    location.hash = '#settings';
    return;
  }
  if (!(state.contacts || []).length) {
    try { await loadContacts(); } catch (_) { /* ignore */ }
  }
  const contacts = state.contacts || [];
  const body = el('div', { class: 'modal-body' });
  const defaultAccountId = state.sendDefaults.defaultAccountId || (accounts[0] && accounts[0].id);
  const fields = [
    ['account', 'From account', el('select', {}, accounts.map((a) => el('option', { value: a.id, text: `${a.name} <${a.email}>` })))],
    ['from', 'From', el('input', { type: 'text', placeholder: 'Optional from override', value: state.project.from_name || '' })],
    ['replyTo', 'Reply-to', el('input', { type: 'text', value: state.project.reply_to || '' })],
    ['to', 'To', el('input', { type: 'text', placeholder: 'recipient@example.com', value: state.project.to_addr || '' })],
    ['cc', 'Cc', el('input', { type: 'text', value: state.project.cc_addr || '' })],
    ['bcc', 'Bcc', el('input', { type: 'text', value: state.project.bcc_addr || '' })],
    ['subject', 'Subject', el('input', { type: 'text', value: state.project.subject || state.project.name })],
  ];
  const controls = {};
  for (const [key, label, input] of fields) {
    controls[key] = input;
    if (key === 'account') input.value = defaultAccountId;
    body.append(el('div', { class: 'field' }, [el('label', { text: label }), input]));
  }
  if (contacts.length) {
    const sel = el('select', {}, [el('option', { value: '', text: 'No contact merge' }), ...contacts.map((c) => el('option', { value: c.id, text: `${c.first_name} ${c.last_name} <${c.email}>` }))]);
    controls.contactId = sel;
    body.append(el('div', { class: 'field' }, [el('label', { text: 'Contact' }), sel]));
  }
  const when = el('input', { type: 'datetime-local' });
  const tz = el('input', { type: 'text', value: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  body.append(el('div', { class: 'field' }, [el('label', { text: 'Schedule' }), when]));
  body.append(el('div', { class: 'field' }, [el('label', { text: 'Timezone' }), tz]));

  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Send Test', onclick: () => doSend(controls, 'test', handle) }),
    el('button', { class: 'btn', text: 'Schedule', onclick: () => doSchedule(controls, when, tz, handle) }),
    el('button', { class: 'btn primary', text: kind === 'test' ? 'Send Test' : 'Send Email', onclick: () => doSend(controls, kind, handle) }),
  ]);
  const handle = await modalHost({ title: kind === 'test' ? 'Send test email' : 'Send email', body, foot });
}

async function doSend(controls, kind, modalHandle) {
  const payload = {
    accountId: controls.account.value,
    from: controls.from.value,
    replyTo: controls.replyTo.value,
    to: controls.to.value,
    cc: controls.cc.value,
    bcc: controls.bcc.value,
    subject: kind === 'test' ? `[TEST] ${controls.subject.value}` : controls.subject.value,
    html: state.generated.html,
    projectId: state.project.id,
    projectName: state.project.name,
    kind,
    contactId: controls.contactId ? controls.contactId.value : undefined,
  };
  if (!payload.to.trim()) { toast('Recipient is required', 'warn'); return; }
  try {
    await api.post(kind === 'test' ? '/api/send/test' : '/api/send', payload);
    modalHandle.close();
    toast(kind === 'test' ? 'Test email sent' : 'Email sent', 'success');
    refreshHistory();
  } catch (err) {
    toast(`Send failed: ${err.message}`, 'error');
    if (err.code === 'GMAIL_AUTH_EXPIRED') toast('Gmail authorization expired — reconnect in Settings', 'warn', 8000);
  }
}

async function doSchedule(controls, when, tz, modalHandle) {
  if (!when.value) { toast('Pick a date and time', 'warn'); return; }
  const scheduledAt = new Date(when.value).getTime();
  try {
    await api.post('/api/schedule', {
      accountId: controls.account.value,
      from: controls.from.value,
      replyTo: controls.replyTo.value,
      to: controls.to.value,
      cc: controls.cc.value,
      bcc: controls.bcc.value,
      subject: controls.subject.value,
      html: state.generated.html,
      projectId: state.project.id,
      projectName: state.project.name,
      scheduledAt,
      timezone: tz.value,
    });
    modalHandle.close();
    toast('Send scheduled', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function modalHost({ title, body, foot }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const close = () => { backdrop.remove(); };
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: title }), el('button', { class: 'x', html: '&times;', onclick: close })]),
      body,
      foot,
    ]);
    backdrop.append(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.append(backdrop);
    resolve({ close, queryActive: () => foot.querySelector('.btn.primary') });
  });
}

function syncVisualChanges() {
  const html = serializeCurrent();
  if (html && html !== state.project.html) {
    state.project.html = html;
    if (htmlEditor) setValue(htmlEditor, html);
    markDirty();
  }
}

function renderInspector() {
  if (!state.workspaceEls || state.mode !== 'visual') return;
  renderCenter();
}

function onGlobalKeys(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
    return;
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    doSave(true);
  }
}

export function openCommandPalette() {
  const commands = [
    { id: 'save', label: 'Save', run: () => doSave(true) },
    { id: 'format', label: 'Format document', run: () => formatAll() },
    { id: 'preview', label: 'Focus preview', run: () => renderPreviewNow() },
    { id: 'convert', label: 'Convert to email HTML', run: () => convert() },
    { id: 'doctor', label: 'Run Email Doctor', run: () => runDoctor() },
    { id: 'send', label: 'Send email', run: () => openSendModal('email') },
    { id: 'test', label: 'Send test email', run: () => openSendModal('test') },
    { id: 'duplicate', label: 'Duplicate project', run: async () => {
      const res = await api.post(`/api/projects/${state.project.id}/duplicate`);
      location.hash = `#workspace/${res.project.id}`;
    } },
    { id: 'export', label: 'Export ZIP', run: () => downloadZip() },
    { id: 'code', label: 'Code mode', run: () => setMode('code') },
    { id: 'visual', label: 'Visual mode', run: () => setMode('visual') },
    { id: 'output', label: 'Output mode', run: () => setMode('output') },
  ];
  const input = el('input', { type: 'text', placeholder: 'Type a command…', 'aria-label': 'Command palette' });
  const list = el('div', { class: 'cmd-list' });
  function render(q) {
    clear(list);
    const s = (q || '').toLowerCase();
    commands.filter((c) => c.label.toLowerCase().includes(s)).forEach((c) => {
      list.append(el('button', { class: 'cmd-item', text: c.label, onclick: () => { close(); c.run(); } }));
    });
  }
  render('');
  input.oninput = () => render(input.value);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const first = list.querySelector('button');
      if (first) first.click();
    }
    if (e.key === 'Escape') close();
  };
  const backdrop = el('div', { class: 'modal-backdrop' });
  const close = () => backdrop.remove();
  backdrop.append(el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Command palette' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    el('div', { class: 'modal-body' }, [input, list]),
  ]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  input.focus();
}

export function teardownWorkspace() {
  if (visualHandle) { destroyVisual(); visualHandle = null; }
  if (visualKeyHandler) { document.removeEventListener('keydown', visualKeyHandler); visualKeyHandler = null; }
  if (globalKeyHandler) { document.removeEventListener('keydown', globalKeyHandler); globalKeyHandler = null; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (state.project && state.saveState !== 'saved') doSave();
}
