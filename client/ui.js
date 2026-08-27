export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of flatten(children)) {
    if (c === null || c === undefined) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function flatten(arr) {
  const out = [];
  for (const c of arr) {
    if (Array.isArray(c)) out.push(...flatten(c));
    else out.push(c);
  }
  return out;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function toast(message, type = 'info', timeout = 4200) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = el('div', { class: 'toast-wrap' });
    document.body.append(wrap);
  }
  const t = el('div', { class: `toast ${type}`, text: message });
  wrap.append(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 320);
  }, timeout);
}

export function confirmDialog(title, message, okLabel = 'Delete', danger = true) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const body = el('div', { class: 'modal-body', html: `<p style="margin:0">${escapeHtml(message)}</p>` });
    const foot = el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { backdrop.remove(); resolve(false); } }),
      el('button', { class: danger ? 'btn danger' : 'btn primary', text: okLabel, onclick: () => { backdrop.remove(); resolve(true); } }),
    ]);
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'modal-head' }, [el('h2', { text: title })]),
      body,
      foot,
    ]);
    backdrop.append(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); resolve(false); } });
    document.body.append(backdrop);
  });
}

export function modal({ title, body, foot, wide = false, onClose }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const closeBtn = el('button', { class: 'x', html: '&times;', onclick: () => { backdrop.remove(); onClose && onClose(); resolve(null); } });
    const head = el('div', { class: 'modal-head' }, [el('h2', { text: title }), closeBtn]);
    const modal = el('div', { class: `modal${wide ? ' wide' : ''}` }, [head, body, foot || el('div')]);
    backdrop.append(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) { backdrop.remove(); onClose && onClose(); resolve(null); } });
    document.body.append(backdrop);
    resolve({
      close: (result) => { backdrop.remove(); onClose && onClose(); resolve(result); },
      backdrop,
      modal,
    });
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function dateStr(ts) {
  return new Date(ts).toLocaleString();
}

export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function downloadFile(filename, content, mime = 'text/html') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
