import { el } from '../ui.js';
import { state } from '../state.js';
import { BLOCKS } from '../blocks.js';
import { api } from '../api.js';

let iframeEl = null;
let doc = null;
let selectedEl = null;
let selectedInfo = null;
let overlay = null;
let bodyEl = null;
let callbacks = {};
let changeTimer = null;
let dragEl = null;

export function buildDoc({ html, css }) {
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style data-es-preview>${css || ''}</style>`);
    }
    return html;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style data-es-preview>${css || ''}</style></head><body>${html || ''}</body></html>`;
}

export function serializeCurrent() {
  if (!doc || !doc.documentElement) return state.project.html;
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll('style[data-es-preview]').forEach((s) => s.remove());
  clone.querySelectorAll('[data-es-hover],[contenteditable]').forEach((n) => {
    n.removeAttribute('data-es-hover');
    n.removeAttribute('contenteditable');
  });
  return `<!doctype html>${clone.outerHTML}`;
}

export function initVisual(iframe, cb) {
  iframeEl = iframe;
  callbacks = cb || {};
  selectedInfo = null;
  selectedEl = null;
  try {
    doc = iframe.contentDocument;
  } catch (_) {
    return null;
  }
  bodyEl = iframe.parentElement ? iframe.closest('.preview-body') : null;
  if (!bodyEl) bodyEl = iframe.parentElement;

  doc.addEventListener('click', onDocClick, true);
  doc.addEventListener('mouseover', onMouseOver, true);
  doc.addEventListener('mouseout', onMouseOut, true);
  doc.addEventListener('dblclick', onDblClick, true);
  doc.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', updateOverlay);

  overlay = el('div', {
    class: 'visual-outline',
    style: 'position:absolute;border:2px solid #007acc;background:rgba(0,122,204,0.08);pointer-events:none;z-index:50;display:none;',
  });
  bodyEl.style.position = 'relative';
  bodyEl.append(overlay);
  return { iframe };
}

export function destroyVisual() {
  if (!doc) return;
  doc.removeEventListener('click', onDocClick, true);
  doc.removeEventListener('mouseover', onMouseOver, true);
  doc.removeEventListener('mouseout', onMouseOut, true);
  doc.removeEventListener('dblclick', onDblClick, true);
  doc.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', updateOverlay);
  if (overlay && overlay.parentNode) overlay.remove();
  overlay = null;
  iframeEl = null;
  doc = null;
  selectedEl = null;
  selectedInfo = null;
}

function onMouseOver(e) {
  if (!overlay) return;
  const target = closestEditable(e.target);
  if (!target || target === selectedEl) return;
  updateOverlayRect(target, true);
}

function onMouseOut() {
  if (!overlay) return;
  if (!selectedEl) overlay.style.display = 'none';
  else updateOverlayRect(selectedEl);
}

function closestEditable(node) {
  let n = node;
  while (n && n !== doc.body && n !== doc.documentElement) {
    if (n.nodeType === 1 && !/^(html|body|head|meta|title|style|link)$/i.test(n.tagName)) return n;
    n = n.parentNode;
  }
  return null;
}

function onDocClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = closestEditable(e.target);
  if (!target) {
    select(null);
    return;
  }
  select(target);
}

function onDblClick(e) {
  const target = closestEditable(e.target);
  if (!target) return;
  if (/^(p|h1|h2|h3|h4|h5|h6|span|a|td|li|blockquote)$/i.test(target.tagName)) {
    target.setAttribute('contenteditable', 'true');
    target.focus();
    target.addEventListener('blur', () => {
      target.removeAttribute('contenteditable');
      pushSnapshot();
      scheduleSync();
    }, { once: true });
  }
}

function onKey(e) {
  if (!selectedEl) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (doc.activeElement && doc.activeElement.isContentEditable) return;
    e.preventDefault();
    deleteSelected();
  }
}

function select(node) {
  selectedEl = node;
  if (!node) {
    selectedInfo = null;
    if (overlay) overlay.style.display = 'none';
    callbacks.onSelect && callbacks.onSelect(null);
    return;
  }
  const tag = node.tagName.toLowerCase();
  const selector = buildSelector(node);
  selectedInfo = {
    tag,
    id: node.id || '',
    className: typeof node.className === 'string' ? node.className : '',
    selector,
    el: node,
    doc,
    href: node.getAttribute('href') || '',
    src: node.getAttribute('src') || '',
    alt: node.getAttribute('alt') || '',
    text: (node.innerText || '').slice(0, 400),
  };
  updateOverlayRect(node);
  callbacks.onSelect && callbacks.onSelect(selectedInfo);
}

function buildSelector(node) {
  const parts = [];
  let n = node;
  while (n && n !== doc.body && n.nodeType === 1) {
    let part = n.tagName.toLowerCase();
    if (n.id) { part += '#' + n.id; parts.unshift(part); break; }
    if (typeof n.className === 'string' && n.className.trim()) {
      part += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    parts.unshift(part);
    n = n.parentNode;
  }
  return parts.join(' > ');
}

function updateOverlayRect(node, hover = false) {
  if (!overlay || !node) return;
  const r = node.getBoundingClientRect();
  const iframeRect = iframeEl.getBoundingClientRect();
  const bodyRect = bodyEl.getBoundingClientRect();
  const left = iframeRect.left - bodyRect.left + (r.left - iframeRect.left) + bodyEl.scrollLeft;
  const top = iframeRect.top - bodyRect.top + (r.top - iframeRect.top) + bodyEl.scrollTop;
  overlay.style.left = Math.max(0, left) + 'px';
  overlay.style.top = Math.max(0, top) + 'px';
  overlay.style.width = Math.max(0, r.width) + 'px';
  overlay.style.height = Math.max(0, r.height) + 'px';
  overlay.style.display = 'block';
  overlay.style.borderColor = hover && selectedEl !== node ? '#666' : '#007acc';
  overlay.style.background = hover && selectedEl !== node ? 'rgba(255,255,255,0.03)' : 'rgba(0,122,204,0.08)';
}

function updateOverlay() {
  if (selectedEl) updateOverlayRect(selectedEl);
}

export function getSelectedInfo() {
  return selectedInfo;
}

export function applyStyle(prop, value) {
  if (!selectedEl) return;
  if (value === undefined || value === null || value === '') {
    selectedEl.style.removeProperty(prop);
  } else {
    selectedEl.style.setProperty(prop, String(value));
  }
  scheduleSync();
}

export function applyStyleMap(styles) {
  if (!selectedEl) return;
  for (const [prop, value] of Object.entries(styles)) {
    if (value === undefined || value === null || value === '') selectedEl.style.removeProperty(prop);
    else selectedEl.style.setProperty(prop, String(value));
  }
  scheduleSync();
}

export function applyAttr(name, value) {
  if (!selectedEl) return;
  if (!value) selectedEl.removeAttribute(name);
  else selectedEl.setAttribute(name, value);
  scheduleSync();
}

function scheduleSync() {
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    changeTimer = null;
    callbacks.onChanged && callbacks.onChanged();
  }, 350);
}

export function undoVisual() {
  restoreFromHistory(-1);
}

export function redoVisual() {
  restoreFromHistory(1);
}

function restoreFromHistory(dir) {
  const stack = state.visualHistory;
  let idx = state.visualHistoryIndex;
  const target = idx + dir;
  if (target < 0 || target >= stack.length) return;
  const html = stack[target];
  if (html === serializeCurrent()) return;
  state.visualHistoryIndex = target;
  if (iframeEl) {
    const css = state.project.css;
    iframeEl.srcdoc = buildDoc({ html, css });
    callbacks.onChanged && callbacks.onChanged();
  }
}

export function pushSnapshot() {
  if (!doc) return;
  const html = serializeCurrent();
  const stack = state.visualHistory;
  const cur = stack[state.visualHistoryIndex];
  if (cur === html) return;
  const next = stack.slice(0, state.visualHistoryIndex + 1);
  next.push(html);
  if (next.length > 100) next.shift();
  state.visualHistory = next;
  state.visualHistoryIndex = next.length - 1;
}

export function insertBlockHtml(html, afterSelected) {
  if (!doc) return;
  pushSnapshot();
  const wrap = doc.createElement('div');
  wrap.innerHTML = html;
  const nodes = [...wrap.childNodes];
  const target = afterSelected && selectedEl ? selectedEl : doc.body;
  for (const n of nodes) {
    if (afterSelected && selectedEl && selectedEl.parentNode) {
      selectedEl.parentNode.insertBefore(n, selectedEl.nextSibling);
    } else {
      doc.body.appendChild(n);
    }
  }
  scheduleSync();
}

export function duplicateSelected() {
  if (!selectedEl) return;
  pushSnapshot();
  const clone = selectedEl.cloneNode(true);
  selectedEl.parentNode.insertBefore(clone, selectedEl.nextSibling);
  select(clone);
  scheduleSync();
}

export function deleteSelected() {
  if (!selectedEl) return;
  pushSnapshot();
  const parent = selectedEl.parentNode;
  const next = selectedEl.nextElementSibling || selectedEl.previousElementSibling;
  selectedEl.remove();
  select(next || null);
  scheduleSync();
}

export function moveSelected(dir) {
  if (!selectedEl || !selectedEl.parentNode) return;
  pushSnapshot();
  if (dir < 0 && selectedEl.previousElementSibling) {
    selectedEl.parentNode.insertBefore(selectedEl, selectedEl.previousElementSibling);
  } else if (dir > 0 && selectedEl.nextElementSibling) {
    selectedEl.parentNode.insertBefore(selectedEl.nextElementSibling, selectedEl);
  }
  updateOverlay();
  scheduleSync();
}

function group(title) {
  return el('div', { class: 'group' }, [el('div', { class: 'group-title', text: title })]);
}

function inspectorField(label, input) {
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

function curStyle(info, prop) {
  return info.el.style.getPropertyValue(prop).trim();
}

function textInput(placeholder) {
  return el('input', { type: 'text', placeholder });
}

export function buildPalette(onInsert) {
  const root = el('div', { class: 'block-palette' });
  const cats = {};
  for (const b of BLOCKS) {
    if (!cats[b.category]) cats[b.category] = [];
    cats[b.category].push(b);
  }
  for (const [cat, items] of Object.entries(cats)) {
    const g = group(cat);
    const list = el('div', { class: 'palette-list' });
    for (const b of items) {
      const btn = el('button', {
        class: 'palette-item',
        type: 'button',
        draggable: 'true',
        text: b.label,
        onclick: () => onInsert(b.html),
      });
      btn.addEventListener('dragstart', (e) => {
        dragEl = b;
        e.dataTransfer.setData('text/plain', b.html);
      });
      list.append(btn);
    }
    g.append(list);
    root.append(g);
  }
  const saved = el('div', { class: 'group' }, [el('div', { class: 'group-title', text: 'Saved blocks' })]);
  const savedList = el('div', { class: 'palette-list' });
  saved.append(savedList);
  root.append(saved);
  api.get('/api/blocks').then((res) => {
    for (const b of res.blocks || []) {
      savedList.append(el('button', {
        class: 'palette-item',
        type: 'button',
        text: b.name,
        onclick: () => onInsert(b.html),
      }));
    }
    if (!(res.blocks || []).length) savedList.append(el('div', { class: 'hint', text: 'Save a selection as a reusable block.' }));
  }).catch(() => {});
  return root;
}

export function buildInspector(info) {
  const root = el('div', { class: 'inspector' });
  const { el: node } = info;
  const tagBadge = el('span', { class: 'badge', text: `<${info.tag}>` });
  const selector = el('div', { class: 'hint mono', style: 'word-break:break-all;margin-bottom:8px', text: info.selector });
  const headRow = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap' }, [
    tagBadge,
    el('button', { class: 'btn small', text: 'Deselect', onclick: () => callbacks.onSelect && callbacks.onSelect(null) }),
    el('div', { class: 'topbar-spacer' }),
    el('button', { class: 'btn small', text: 'Up', onclick: () => moveSelected(-1) }),
    el('button', { class: 'btn small', text: 'Down', onclick: () => moveSelected(1) }),
    el('button', { class: 'btn small', text: 'Duplicate', onclick: () => duplicateSelected() }),
    el('button', { class: 'btn small danger', text: 'Delete', onclick: () => deleteSelected() }),
  ]);
  root.append(headRow, selector);

  const onChange = (prop) => (e) => {
    pushSnapshot();
    applyStyle(prop, e.target.value);
  };

  if (/^(p|h1|h2|h3|h4|h5|h6|a|span|td|blockquote)$/i.test(info.tag)) {
    const content = group('Content');
    const ta = el('textarea', { rows: '4' });
    ta.value = node.innerText || '';
    ta.oninput = () => { node.innerText = ta.value; scheduleSync(); };
    content.append(inspectorField('Text', ta));
    root.append(content);
  }

  if (info.tag === 'a') {
    const link = group('Link');
    const href = textInput('https://');
    href.value = node.getAttribute('href') || '';
    href.oninput = () => { pushSnapshot(); applyAttr('href', href.value); };
    link.append(inspectorField('URL', href));
    root.append(link);
  }

  if (info.tag === 'img') {
    const img = group('Image');
    const src = textInput('/api/assets/…');
    src.value = node.getAttribute('src') || '';
    src.oninput = () => { pushSnapshot(); applyAttr('src', src.value); };
    const alt = textInput('Alt text');
    alt.value = node.getAttribute('alt') || '';
    alt.oninput = () => applyAttr('alt', alt.value);
    img.append(inspectorField('Source', src), inspectorField('Alt', alt));
    root.append(img);
  }

  const typo = group('Typography');
  typo.append(
    inspectorField('Font family', (() => { const i = textInput('Helvetica, Arial'); i.value = curStyle(info, 'font-family'); i.oninput = onChange('font-family'); return i; })()),
    inspectorField('Font size', (() => { const i = textInput('16px'); i.value = curStyle(info, 'font-size'); i.oninput = onChange('font-size'); return i; })()),
    inspectorField('Font weight', (() => {
      const s = el('select', {}, ['normal', 'bold', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900']
        .map((v) => el('option', { value: v, text: v })));
      s.value = curStyle(info, 'font-weight') || 'normal';
      s.onchange = onChange('font-weight');
      return s;
    })()),
    inspectorField('Line height', (() => { const i = textInput('1.5'); i.value = curStyle(info, 'line-height'); i.oninput = onChange('line-height'); return i; })()),
  );
  const ta = el('div', { class: 'seg' }, ['left', 'center', 'right'].map((v) =>
    el('button', { class: curStyle(info, 'text-align') === v ? 'active' : '', text: v, onclick: (e) => {
      pushSnapshot();
      applyStyle('text-align', v);
      ta.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
    } })));
  typo.append(el('div', { class: 'row' }, [el('label', { text: 'Align' }), ta]));
  root.append(typo);

  const colors = group('Colors');
  colors.append(
    colorField('Text color', 'color', info, onChange),
    colorField('Background', 'background-color', info, onChange),
  );
  root.append(colors);

  const spacing = group('Spacing');
  const sides = ['top', 'right', 'bottom', 'left'];
  const padRow = el('div', { style: 'display:flex;gap:4px' });
  sides.forEach((side) => {
    const i = textInput(side);
    i.style.flex = '1';
    i.title = `Padding ${side}`;
    i.value = curStyle(info, `padding-${side}`);
    i.oninput = onChange(`padding-${side}`);
    padRow.append(i);
  });
  const marRow = el('div', { style: 'display:flex;gap:4px' });
  sides.forEach((side) => {
    const i = textInput(side);
    i.style.flex = '1';
    i.title = `Margin ${side}`;
    i.value = curStyle(info, `margin-${side}`);
    i.oninput = onChange(`margin-${side}`);
    marRow.append(i);
  });
  spacing.append(
    el('div', { class: 'row' }, [el('label', { text: 'Padding' }), padRow]),
    el('div', { class: 'row' }, [el('label', { text: 'Margin' }), marRow]),
  );
  root.append(spacing);

  const borders = group('Border');
  borders.append(
    inspectorField('Width', (() => { const i = textInput('1px'); i.value = curStyle(info, 'border-width'); i.oninput = onChange('border-width'); return i; })()),
    inspectorField('Style', (() => {
      const s = el('select', {}, ['solid', 'dashed', 'dotted', 'double', 'none'].map((v) => el('option', { value: v, text: v })));
      s.value = curStyle(info, 'border-style') || 'solid';
      s.onchange = onChange('border-style');
      return s;
    })()),
    colorField('Color', 'border-color', info, onChange),
    inspectorField('Radius', (() => { const i = textInput('0px'); i.value = curStyle(info, 'border-radius'); i.oninput = onChange('border-radius'); return i; })()),
  );
  root.append(borders);

  const layout = group('Layout');
  layout.append(
    inspectorField('Width', (() => { const i = textInput('100%'); i.value = curStyle(info, 'width'); i.oninput = onChange('width'); return i; })()),
    inspectorField('Max width', (() => { const i = textInput('600px'); i.value = curStyle(info, 'max-width'); i.oninput = onChange('max-width'); return i; })()),
    inspectorField('Height', (() => { const i = textInput(''); i.value = curStyle(info, 'height'); i.oninput = onChange('height'); return i; })()),
  );
  root.append(layout);

  const saveBlock = el('button', { class: 'btn small', text: 'Save as reusable block', onclick: async () => {
    const name = window.prompt('Block name', info.tag + ' block');
    if (!name) return;
    await api.post('/api/blocks', { name, html: node.outerHTML, css: '' });
    callbacks.onToast && callbacks.onToast('Block saved');
  } });
  const resetBtn = el('button', { class: 'btn small', text: 'Clear inline styles', onclick: () => {
    if (!info.el) return;
    pushSnapshot();
    info.el.removeAttribute('style');
    scheduleSync();
    renderInspectorRefresh();
  } });
  root.append(el('div', { style: 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap' }, [saveBlock, resetBtn]));

  return root;
}

function renderInspectorRefresh() {
  callbacks.onSelect && callbacks.onSelect(selectedInfo);
}

function colorField(label, prop, info, onChange) {
  const swatch = el('input', { type: 'color' });
  const text = textInput('#000000');
  const value = curStyle(info, prop);
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) { swatch.value = value; text.value = value; }
  else if (/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.test(value)) {
    const m = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    swatch.value = '#' + m.slice(1).map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
    text.value = value;
  } else {
    text.value = value;
  }
  const apply = (v) => { pushSnapshot(); applyStyle(prop, v); };
  swatch.oninput = (e) => { text.value = e.target.value; apply(e.target.value); };
  text.oninput = (e) => {
    if (/^#[0-9a-fA-F]{3,8}$/.test(e.target.value)) swatch.value = e.target.value;
    apply(e.target.value);
  };
  return el('div', { class: 'row' }, [el('label', { text: label }), el('div', { class: 'swatch-row', style: 'flex:1' }, [swatch, text])]);
}
