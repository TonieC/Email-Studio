import { el, clear, toast, copyText, confirmDialog, formatBytes, timeAgo, escapeHtml } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { loadAssets } from '../actions.js';

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
  page.append(head, grid);
  renderGrid(grid);
  clear(state.mainEl);
  state.mainEl.append(page);
}

function renderGrid(grid) {
  clear(grid);
  if (!state.assets.length) {
    grid.append(el('div', { class: 'empty-state', style: 'grid-column:1/-1' }, [
      el('div', { class: 'big', text: '◫' }),
      el('div', { text: 'No assets yet. Upload images here.' }),
    ]));
    return;
  }
  for (const a of state.assets) {
    const thumb = el('div', { class: 'thumb' }, [el('img', { src: a.url, alt: '', loading: 'lazy' })]);
    const card = el('div', { class: 'asset-card' }, [
      thumb,
      el('div', { class: 'info' }, [
        el('div', { class: 'name', title: a.original_name, text: a.original_name }),
        el('div', { class: 'meta', text: `${formatBytes(a.size)} · ${timeAgo(a.created_at)}` }),
      ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn small', text: 'Copy URL', onclick: () => copyAssetUrl(a) }),
        el('button', { class: 'btn small', text: 'Rename', onclick: () => renameAsset(a) }),
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
    await loadAssets();
    renderAssets();
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
        await loadAssets();
        renderAssets();
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

function uploadDialog() {
  const input = el('input', { type: 'file', accept: 'image/*', style: 'display:none', multiple: true });
  const drop = el('div', {
    class: 'empty-state',
    style: 'border:1px dashed #4a4a4a;border-radius:8px;cursor:pointer;padding:28px',
    html: '<div class="big">↥</div><div>Drop images here or click to choose</div><div class="hint" style="margin-top:6px">PNG, JPG, GIF, WEBP, AVIF · max 5 MB each</div>',
  });
  drop.addEventListener('click', () => input.click());
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
        const res = await api.upload('/api/assets', file);
        toast(`Uploaded ${file.name}`, 'success');
      } catch (e) {
        toast(`Upload failed for ${file.name}: ${e.message}`, 'error');
      }
    }
    close();
    await loadAssets();
    renderAssets();
  }
}
