import { el } from '../ui.js';
import { state } from '../state.js';

let iframeEl = null;
let doc = null;
let selectedEl = null;
let selectedInfo = null;
let overlay = null;
let bodyEl = null;
let callbacks = {};
let changeTimer = null;

export function buildDoc({ html, css }) {
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style data-es-preview>${css || ''}</style>`);
    }
    return html;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style data-es-preview>${css || ''}</style></head><body>${html || ''}</body></html>`;
}

export function serializeCurrent() {
  if (!doc || !doc.documentElement) return state.project.html;
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll('style[data-es-preview]').forEach((s) => s.remove());
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
  window.addEventListener('resize', updateOverlay);

  // Overlay for the selected element
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

/* ---------------- Inspector ---------------- */

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

export function buildInspector(info) {
  const root = el('div', { class: 'inspector' });
  const { el: node } = info;
  const tagBadge = el('span', { class: 'badge', text: `<${info.tag}>` });
  const selector = el('div', { class: 'hint mono', style: 'word-break:break-all;margin-bottom:8px', text: info.selector });
  const headRow = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, [
    tagBadge,
    el('button', { class: 'btn small', text: 'Deselect', onclick: () => callbacks.onSelect && callbacks.onSelect(null) }),
    el('div', { class: 'topbar-spacer' }),
    el('button', { class: 'btn small', text: 'Undo (Ctrl+Z)', onclick: () => undoVisual() }),
    el('button', { class: 'btn small', text: 'Redo', onclick: () => redoVisual() }),
  ]);
  root.append(headRow, selector);

  const onChange = (prop) => (e) => {
    pushSnapshot();
    applyStyle(prop, e.target.value);
  };

  // Typography
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

  // Colors
  const colors = group('Colors');
  colors.append(
    colorField('Text color', 'color', info, onChange),
    colorField('Background', 'background-color', info, onChange),
  );
  root.append(colors);

  // Spacing
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

  // Borders
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

  // Layout
  const layout = group('Layout');
  layout.append(
    inspectorField('Width', (() => { const i = textInput('100%'); i.value = curStyle(info, 'width'); i.oninput = onChange('width'); return i; })()),
    inspectorField('Max width', (() => { const i = textInput('600px'); i.value = curStyle(info, 'max-width'); i.oninput = onChange('max-width'); return i; })()),
    inspectorField('Height', (() => { const i = textInput(''); i.value = curStyle(info, 'height'); i.oninput = onChange('height'); return i; })()),
  );
  root.append(layout);

  const resetBtn = el('button', { class: 'btn small', text: 'Clear inline styles on this element', onclick: () => {
    if (!info.el) return;
    pushSnapshot();
    info.el.removeAttribute('style');
    scheduleSync();
    renderInspectorRefresh();
  } });
  root.append(el('div', { style: 'margin-top:8px' }, [resetBtn]));

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
