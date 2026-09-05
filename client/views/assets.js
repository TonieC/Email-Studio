import { el, clear, toast, copyText, confirmDialog, formatBytes, timeAgo } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { loadAssets } from '../actions.js';

const filters = { q: '', sort: 'created', unused: false };

export function renderAssets() {
  const page = el('div', { class: 'page' });
  const grid = el('div', { class: 'asset-grid' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Assets' }),
      el('div', { class: 'sub', text: 'Upload images to use in your emails.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn primary', text: '+ Upload', onclick: () => uploadDialog() }),
    ]),
  ]);
  const search = el('input', { type: 'search', placeholder: 'Search assets…', value: filters.q, 'aria-label': 'Search assets' });
  search.oninput = debounce(async () => {
    filters.q = search.value.trim();
    await reload();
  }, 200);
  const sort = el('select', { 'aria-label': 'Sort assets' }, [
    el('option', { value: 'created', text: 'Newest' }),
    el('option', { value: 'name', text: 'Name' }),
    el('option', { value: 'size', text: 'Size' }),
    el('option', { value: 'usage', text: 'Usage' }),
  ]);
  sort.value = filters.sort;
  sort.onchange = async () => { filters.sort = sort.value; await reload(); };
  const unused = el('button', {
    class: 'btn' + (filters.unused ? ' primary' : ''),
    text: filters.unused ? 'Unused only' : 'Show unused',
    onclick: async () => { filters.unused = !filters.unused; await reload(); },
  });
  page.append(head, el('div', { class: 'filter-bar' }, [search, sort, unused]), grid);
  renderGrid(grid);
  clear(state.mainEl);
  state.mainEl.append(page);
}

async function reload() {
  await loadAssets({ q: filters.q, sort: filters.sort, unused: filters.unused ? '1' : '' });
  renderAssets();
}

function renderGrid(grid) {
  clear(grid);
  if (!state.assets.length) {
    grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: 'Assets' }),
      el('div', { text: 'No assets yet. Upload images here.' }),
    ]));
    return;
  }
  for (const a of state.assets) {
    const dim = a.width && a.height ? `${a.width}x${a.height}` : '';
    const thumb = el('div', { class: 'thumb' }, [el('img', { src: a.url, alt: a.original_name || '', loading: 'lazy' })]);
    const meta = [formatBytes(a.size), dim, timeAgo(a.created_at), a.usage ? `${a.usage} uses` : 'unused'].filter(Boolean).join(' · ');
    const card = el('div', { class: 'asset-card' + (a.unused ? ' unused' : '') + (a.oversized ? ' oversized' : '') }, [
      thumb,
      el('div', { class: 'info' }, [
        el('div', { class: 'name', title: a.original_name, text: a.original_name }),
        el('div', { class: 'meta', text: meta }),
        a.oversized ? el('div', { class: 'warn-text', text: 'Oversized for email' }) : null,
      ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn small', text: 'Copy URL', onclick: () => copyAssetUrl(a) }),
        el('button', { class: 'btn small', text: 'Rename', onclick: () => renameAsset(a) }),
        el('button', { class: 'btn small', text: 'Replace', onclick: () => replaceAsset(a) }),
        el('button', { class: 'btn small', text: 'Resize', onclick: () => processAsset(a) }),
        el('button', { class: 'btn small danger', text: 'Delete', onclick: () => deleteAsset(a) }),
      ]),
    ]);
    grid.append(card);
  }
}

function copyAssetUrl(a) {
  const base = (state.settings.publicBaseUrl || '').replace(/\/+$/, '');
  const url = base ? `${base}${a.url}` : a.url;
  copyText(url).then(() => toast('Asset URL copied', 'success')).catch(() => toast('Copy failed', 'error'));
}

async function deleteAsset(a) {
  const ok = await confirmDialog('Delete asset', `Delete "${a.original_name}"?`);
  if (!ok) return;
  try {
    await api.del(`/api/assets/${a.id}`);
    toast('Asset deleted', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renameAsset(a) {
  const input = el('input', { type: 'text', value: a.original_name });
  const body = el('div', { class: 'modal-body' }, [el('div', { class: 'field' }, [el('label', { text: 'Name' }), input])]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: 'Rename', onclick: async () => {
      try {
        await api.patch(`/api/assets/${a.id}`, { name: input.value });
        toast('Asset renamed', 'success');
        close();
        await reload();
      } catch (e) {
        toast(e.message, 'error');
      }
    } }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Rename asset' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  input.focus();
  input.select();
}

function replaceAsset(a) {
  const input = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      await api.upload(`/api/assets/${a.id}/replace`, file);
      toast('Asset replaced', 'success');
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  document.body.append(input);
  input.click();
  input.remove();
}

async function processAsset(a) {
  const width = el('input', { type: 'number', value: '600', min: '1', max: '2400' });
  const quality = el('input', { type: 'number', value: '80', min: '40', max: '100' });
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'hint', text: 'Uses ImageMagick if available on the server. Otherwise the original file is kept.' }),
    el('div', { class: 'field' }, [el('label', { text: 'Max width' }), width]),
    el('div', { class: 'field' }, [el('label', { text: 'Quality' }), quality]),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: 'Process', onclick: async () => {
      try {
        const res = await api.post(`/api/assets/${a.id}/process`, { maxWidth: width.value, quality: quality.value });
        toast(res.result && res.result.processed ? 'Image processed' : ((res.result && res.result.reason) || 'Original kept'), 'info');
        close();
        await reload();
      } catch (e) {
        toast(e.message, 'error');
      }
    } }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  backdrop.append(el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Resize asset' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]));
  document.body.append(backdrop);
}

function uploadDialog() {
  const input = el('input', { type: 'file', accept: 'image/*', style: 'display:none', multiple: true });
  const drop = el('div', {
    class: 'empty-state drop-zone',
    html: '<div class="big">Drop</div><div>Drop images here or click to choose</div><div class="hint" style="margin-top:6px">PNG, JPG, GIF, WEBP, AVIF · max 5 MB each</div>',
  });
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => uploadFiles(input.files));
  const body = el('div', { class: 'modal-body' }, [drop]);
  const foot = el('div', { class: 'modal-foot' }, [el('button', { class: 'btn', text: 'Close', onclick: () => close() })]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Upload assets' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);

  async function uploadFiles(files) {
    for (const file of Array.from(files)) {
      try {
        await api.upload('/api/assets', file);
        toast(`Uploaded ${file.name}`, 'success');
      } catch (e) {
        toast(`Upload failed for ${file.name}: ${e.message}`, 'error');
      }
    }
    close();
    await reload();
  }
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
