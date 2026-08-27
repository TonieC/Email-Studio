import { el, clear, toast, debounce, copyText, downloadFile, escapeHtml, formatBytes } from '../ui.js';
import { api } from '../api.js';
import { state, set } from '../state.js';
import { createEditor, setValue, formatDoc } from '../editor.js';
import { initVisual, destroyVisual, buildDoc, buildInspector, serializeCurrent, undoVisual, redoVisual } from './visual.js';
import { refreshSidebar, refreshHistory } from '../actions.js';

let htmlEditor = null;
let cssEditor = null;
let previewTimer = null;
let visualHandle = null;
let visualKeyHandler = null;
let formatter = null;

async function loadPrettier() {
  if (formatter) return formatter;
  try {
    const standalone = await import('prettier/standalone');
    const htmlPlugin = await import('prettier/plugins/html');
    formatter = async (source, language) =>
      standalone.format(source, {
        parser: language,
        plugins: [htmlPlugin],
        htmlWhitespaceSensitivity: 'ignore',
        tabWidth: 2,
        printWidth: 120,
      });
  } catch (e) {
    console.error('prettier load failed', e);
    formatter = null;
  }
  return formatter;
}

export function renderWorkspace() {
  const elProjectName = el('span', { class: 'project-name editable', text: state.project ? state.project.name : '' });
  const elSave = el('span', { class: 'save-status', text: 'Saved' });
  const elCompat = el('span', { class: 'compat-indicator' });
  const elCenter = el('div', { class: 'pane-center' });
  const elPreview = el('div', { class: 'pane-preview' });
  const elWorkspace = el('div', { class: 'workspace' }, [elCenter, elPreview]);

  const topbar = el('div', { class: 'topbar' }, [
    elProjectName,
    elSave,
    el('div', { class: 'topbar-spacer' }),
    el('button', { class: 'btn', text: 'Format', onclick: () => formatAll() }),
    el('button', { class: 'btn', text: 'Convert', onclick: () => convert() }),
    el('button', { class: 'btn', text: 'Download ZIP', onclick: () => downloadZip() }),
    el('button', { class: 'btn primary', text: 'Send', onclick: () => openSendModal() }),
  ]);

  const modeTabs = el('div', { class: 'mode-tabs' }, [
    el('button', { class: 'mode-tab', text: 'Code', onclick: () => setMode('code') }),
    el('button', { class: 'mode-tab', text: 'Visual', onclick: () => setMode('visual') }),
    el('button', { class: 'mode-tab', text: 'Output', onclick: () => setMode('output') }),
    el('div', { class: 'topbar-spacer' }),
    elCompat,
  ]);

  const content = el('div', { class: 'main', style: 'height:100%;display:flex;flex-direction:column' }, [topbar, modeTabs, elWorkspace]);
  clear(state.mainEl);
  state.mainEl.append(content);

  state.workspaceEls = { elProjectName, elSave, elCompat, elCenter, elPreview, modeTabs };

  // Project name editing
  elProjectName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { elProjectName.blur(); }
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

  // Build editors (once)
  if (!htmlEditor) {
    const shell = buildCodePanes();
    elCenter.append(shell);
    htmlEditor = createEditor({
      parent: state.codeShellEls.htmlParent,
      value: state.project.html,
      language: 'html',
      onChange: (v) => { state.project.html = v; markDirty(); },
    });
    cssEditor = createEditor({
      parent: state.codeShellEls.cssParent,
      value: state.project.css,
      language: 'css',
      onChange: (v) => { state.project.css = v; markDirty(); },
    });
    loadPrettier();
  } else {
    setValue(htmlEditor, state.project.html);
    setValue(cssEditor, state.project.css);
  }

  renderPreviewNow();
  setMode(state.mode);
  renderSaveStatus();
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
}

function buildCodePanes() {
  const htmlPane = el('div', { class: 'code-pane' }, [
    el('div', { class: 'code-pane-head' }, [el('span', { class: 'dot', style: 'background:#e34c26' }), el('span', { text: 'index.html' })]),
    el('div', { class: 'code-shell' }),
  ]);
  const cssPane = el('div', { class: 'code-pane' }, [
    el('div', { class: 'code-pane-head' }, [el('span', { class: 'dot', style: 'background:#563d7c' }), el('span', { text: 'style.css' })]),
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
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveState: 'saving' });
  renderSaveStatus();
  saveTimer = setTimeout(doSave, 900);
}

export async function doSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!state.project) return;
  const project = state.project;
  try {
    const res = await api.put(`/api/projects/${project.id}`, {
      name: project.name,
      html: project.html,
      css: project.css,
    });
    state.project = res.project;
    set({ saveState: 'saved' });
    renderSaveStatus();
    refreshSidebar();
  } catch (e) {
    set({ saveState: 'unsaved' });
    renderSaveStatus();
    toast(`Save failed: ${e.message}`, 'error');
  }
}

function renderSaveStatus() {
  if (!state.workspaceEls) return;
  const el = state.workspaceEls.elSave;
  el.className = 'save-status ' + state.saveState;
  el.textContent = state.saveState === 'saved' ? 'Saved' : state.saveState === 'saving' ? 'Saving…' : 'Unsaved';
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
  if (state.mode === 'output' && state.generated) return state.generated.html;
  return currentDocSource();
}

export function renderPreviewNow() {
  if (!state.workspaceEls) return;
  const { elPreview } = state.workspaceEls;
  clear(elPreview);
  const head = el('div', { class: 'preview-head' }, [
    el('span', { class: 'title', text: state.mode === 'output' && state.generated ? 'Generated email' : 'Live preview' }),
    el('div', { class: 'device-toggle' }, [
      el('button', { class: state.device === 'desktop' ? 'active' : '', text: 'Desktop', onclick: () => setDevice('desktop') }),
      el('button', { class: state.device === 'mobile' ? 'active' : '', text: 'Mobile', onclick: () => setDevice('mobile') }),
    ]),
  ]);
  const width = state.device === 'desktop' ? 600 : 375;
  const note = el('div', { class: 'preview-note', text: state.device === 'desktop' ? '600px desktop' : '375px mobile' });
  const wrap = el('div', { class: 'preview-frame-wrap', style: `width:${width}px` });
  const iframe = el('iframe', {
    class: 'preview-frame',
    sandbox: 'allow-same-origin',
    style: `height: 640px; width: ${width}px;`,
  });
  wrap.append(iframe);
  const body = el('div', { class: 'preview-body' }, [wrap]);
  elPreview.append(head, note, body);

  const doc = currentDocForMode();
  iframe.srcdoc = doc;
  iframe.onload = () => {
    if (state.mode === 'visual') {
      if (visualHandle) destroyVisual();
      visualHandle = initVisual(iframe, {
        onSelect: (info) => { state.selectedElement = info; renderInspector(); },
        onChanged: () => syncVisualChanges(),
      });
    }
  };
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
    modeTabs.querySelectorAll('.mode-tab').forEach((t) => t.classList.remove('active'));
    modeTabs.querySelectorAll('.mode-tab')[['code', 'visual', 'output'].indexOf(mode)].classList.add('active');
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
  } else {
    renderInspectorInto(elCenter);
    if (!state.selectedElement) {
      elCenter.append(el('div', { class: 'empty-state' }, [
        el('div', { class: 'big', text: '◉' }),
        el('div', { text: 'Select an element in the preview to edit its properties.' }),
        el('div', { class: 'hint', style: 'margin-top:6px', text: 'Click any text, button, image or container in the preview.' }),
      ]));
    }
  }
}

/* ---------------- Output ---------------- */

function renderOutputPane(elCenter, elCompat) {
  const elOut = el('div', { class: 'output-shell' });
  const tabs = el('div', { class: 'output-tabs' }, [
    el('button', { class: 'pane-tab active', text: 'Generated Email HTML', onclick: () => switchOutputTab(true) }),
    el('button', { class: 'pane-tab', text: 'Source', onclick: () => switchOutputTab(false) }),
    el('div', { class: 'output-actions' }, [
      el('button', { class: 'btn small', text: 'Copy HTML', onclick: () => copyGenerated() }),
      el('button', { class: 'btn small', text: 'Download HTML', onclick: () => downloadGenerated() }),
    ]),
  ]);
  const codeEl = el('div', { class: 'output-code' });
  const section = el('div', { class: 'section-title' }, [
    el('span', { text: 'Compatibility check' }),
  ]);
  const compatEl = el('div', { class: 'compat-list' });
  const guides = el('div', { class: 'client-guide' });
  elOut.append(tabs, codeEl, section, compatEl, guides);
  elCenter.append(elOut);

  state.outputEls = { codeEl, compatEl, guides, tabs };
  renderOutputContent(true);

  if (state.compatibility.length) renderCompatibility(elCompat);
  renderClientGuides();
}

let outputTabIsGenerated = true;
function switchOutputTab(gen) {
  outputTabIsGenerated = gen;
  renderOutputContent(gen);
}

function renderOutputContent(gen) {
  if (!state.outputEls) return;
  const { codeEl, tabs } = state.outputEls;
  tabs.querySelectorAll('.pane-tab').forEach((t, i) => t.classList.toggle('active', (i === 0) === gen));
  if (!state.generated) {
    clear(codeEl);
    codeEl.append(el('div', { class: 'empty-state' }, [
      el('div', { text: 'No generated email yet' }),
      el('div', { class: 'hint', style: 'margin-top:6px', text: 'Click Convert to generate email-safe HTML.' }),
    ]));
    return;
  }
  const content = gen ? state.generated.html : currentDocSource();
  clear(codeEl);
  codeEl.append(el('pre', { text: content }));
}

function copyGenerated() {
  if (!state.generated) return;
  copyText(state.generated.html).then(() => toast('Generated HTML copied to clipboard', 'success')).catch(() => toast('Copy failed', 'error'));
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
  const icons = { ok: '✓', warn: '⚠', info: 'ℹ' };
  for (const item of list) {
    compatEl.append(el('div', { class: `compat-item ${item.level}` }, [
      el('span', { class: 'icon', text: icons[item.level] || '·' }),
      el('div', {}, [el('span', { text: item.message }), item.detail ? el('span', { class: 'detail', text: item.detail }) : null]),
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
    const list = el('ul', {}, client.tips.map((tip) => el('li', { text: tip })));
    guides.append(el('details', {}, [
      el('summary', {}, [el('span', { class: 'client-name', text: client.name }), el('span', { text: '  guidance' })]),
      list,
    ]));
  }
}

/* ---------------- Convert ---------------- */

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

async function formatAll() {
  if (state.mode !== 'code') setMode('code');
  const fmt = await loadPrettier();
  if (htmlEditor) await formatDoc(htmlEditor, 'html', fmt);
  if (cssEditor) await formatDoc(cssEditor, 'css', fmt);
  if (htmlEditor || cssEditor) toast('Formatted', 'success');
}

/* ---------------- Send ---------------- */

export async function openSendModal() {
  if (!state.generated) {
    await convert();
  }
  if (!state.generated) return;
  const accounts = state.accounts;
  if (!accounts.length) {
    toast('Add an email account in Settings first', 'warn');
    location.hash = '#settings';
    return;
  }

  const body = el('div', { class: 'modal-body' });
  const defaultAccountId = state.sendDefaults.defaultAccountId || (accounts[0] && accounts[0].id);
  const fields = [
    ['account', 'From account', el('select', {}, accounts.map((a) => el('option', { value: a.id, text: `${a.name} <${a.email}>` })))],
    ['from', 'From', el('input', { type: 'text', placeholder: `Optional (defaults to ${accounts[0].email})` })],
    ['to', 'To', el('input', { type: 'text', placeholder: 'recipient@example.com' })],
    ['cc', 'Cc', el('input', { type: 'text', placeholder: 'cc@example.com (optional)' })],
    ['bcc', 'Bcc', el('input', { type: 'text', placeholder: 'bcc@example.com (optional)' })],
    ['subject', 'Subject', el('input', { type: 'text', placeholder: 'Email subject' })],
  ];
  const controls = {};
  for (const [key, label, input] of fields) {
    controls[key] = input;
    input.value = key === 'account' ? defaultAccountId : '';
    body.append(el('div', { class: 'field' }, [el('label', { text: label }), input]));
  }
  controls.subject.value = state.project.name;

  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Send Test', onclick: () => doSend(controls, 'test', m) }),
    el('button', { class: 'btn primary', text: 'Send Email', onclick: () => doSend(controls, 'email', m) }),
  ]);
  const m = await modalHost({ title: 'Send email', body, foot });
  async function doSend(controls, kind, modalHandle) {
    const payload = {
      accountId: controls.account.value,
      from: controls.from.value,
      to: controls.to.value,
      cc: controls.cc.value,
      bcc: controls.bcc.value,
      subject: kind === 'test' ? `[TEST] ${controls.subject.value}` : controls.subject.value,
      html: state.generated.html,
      projectId: state.project.id,
      projectName: state.project.name,
      kind,
    };
    if (!payload.to.trim()) { toast('Recipient is required', 'warn'); return; }
    try {
      const btn = modalHandle && modalHandle.queryActive ? modalHandle.queryActive() : null;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      await api.post('/api/send', payload);
      modalHandle.close();
      toast(kind === 'test' ? 'Test email sent' : 'Email sent', 'success');
      refreshHistory();
    } catch (err) {
      toast(`Send failed: ${err.message}`, 'error');
      if (err.code === 'GMAIL_AUTH_EXPIRED') {
        toast('Gmail authorization expired — reconnect in Settings', 'warn', 8000);
      }
    }
  }
}

function modalHost({ title, body, foot }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const close = () => { backdrop.remove(); resolve({ close }); };
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: title }), el('button', { class: 'x', html: '&times;', onclick: close })]),
      body,
      foot,
    ]);
    backdrop.append(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.append(backdrop);
    resolve({
      close,
      queryActive: () => foot.querySelector('.btn.primary, .btn:not(.ghost)'),
    });
  });
}

/* ---------------- Visual sync ---------------- */

function syncVisualChanges() {
  const html = serializeCurrent();
  if (html && html !== state.project.html) {
    state.project.html = html;
    if (htmlEditor) setValue(htmlEditor, html);
    markDirty();
  }
}

function renderInspectorInto(elCenter) {
  if (state.selectedElement) {
    elCenter.append(buildInspector(state.selectedElement));
  }
}

function renderInspector() {
  if (!state.workspaceEls || state.mode !== 'visual') return;
  renderCenter();
}

export function teardownWorkspace() {
  if (visualHandle) { destroyVisual(); visualHandle = null; }
  if (visualKeyHandler) { document.removeEventListener('keydown', visualKeyHandler); visualKeyHandler = null; }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (state.project && state.saveState !== 'saved') {
    doSave();
  }
}
