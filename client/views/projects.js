import { el, clear, toast, timeAgo, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { loadProjects } from '../actions.js';
import { createProject } from './sidebar.js';

const filters = {
  q: '',
  folderId: '',
  tag: '',
  sort: 'updated',
  view: 'active',
};

const selected = new Set();

export async function renderProjects() {
  await loadProjects(queryParams());
  const page = el('div', { class: 'page' });
  const listEl = el('div', { class: 'card-list' });
  const head = el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Projects' }),
      el('div', { class: 'sub', text: 'Create, organize, convert and send HTML emails.' }),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'btn', text: 'New folder', onclick: () => folderDialog() }),
      el('button', { class: 'btn', text: 'Import HTML', onclick: () => importDialog() }),
      el('button', { class: 'btn primary', text: '+ New project', onclick: () => createProjectDialog() }),
    ]),
  ]);
  page.append(head, buildToolbar(), buildBulkBar(), listEl);

  if (!state.projects.length && filters.view === 'active' && !filters.q && !filters.folderId && !filters.tag) {
    page.append(renderEmptyState());
  } else {
    renderList(listEl);
  }

  clear(state.mainEl);
  state.mainEl.append(page);
}

function buildToolbar() {
  const search = el('input', {
    type: 'search',
    placeholder: 'Search projects…',
    value: filters.q,
    'aria-label': 'Search projects',
  });
  search.addEventListener('input', debounce(async () => {
    filters.q = search.value.trim();
    await reload();
  }, 220));

  const folder = el('select', { 'aria-label': 'Folder' }, [
    el('option', { value: '', text: 'All folders' }),
    el('option', { value: 'none', text: 'Unfiled' }),
    ...(state.folders || []).map((f) => el('option', { value: f.id, text: f.name })),
  ]);
  folder.value = filters.folderId;
  folder.onchange = async () => { filters.folderId = folder.value; await reload(); };

  const tags = uniqueTags();
  const tag = el('select', { 'aria-label': 'Tag' }, [
    el('option', { value: '', text: 'All tags' }),
    ...tags.map((t) => el('option', { value: t, text: t })),
  ]);
  tag.value = filters.tag;
  tag.onchange = async () => { filters.tag = tag.value; await reload(); };

  const sort = el('select', { 'aria-label': 'Sort' }, [
    el('option', { value: 'updated', text: 'Updated' }),
    el('option', { value: 'created', text: 'Created' }),
    el('option', { value: 'opened', text: 'Last opened' }),
    el('option', { value: 'name', text: 'Name' }),
  ]);
  sort.value = filters.sort;
  sort.onchange = async () => { filters.sort = sort.value; await reload(); };

  const views = [
    ['active', 'Active'],
    ['favorites', 'Favorites'],
    ['archived', 'Archive'],
    ['trashed', 'Trash'],
  ];
  const segs = el('div', { class: 'seg' }, views.map(([key, label]) =>
    el('button', {
      class: filters.view === key ? 'active' : '',
      text: label,
      onclick: async () => { filters.view = key; selected.clear(); await reload(); },
    })));

  return el('div', { class: 'filter-bar' }, [
    search,
    folder,
    tag,
    sort,
    segs,
  ]);
}

function buildBulkBar() {
  const bar = el('div', { class: 'bulk-bar', id: 'project-bulk' });
  bar.style.display = selected.size ? 'flex' : 'none';
  bar.append(
    el('span', { class: 'hint', text: `${selected.size} selected` }),
    el('button', { class: 'btn small', text: 'Favorite', onclick: () => bulk('favorite') }),
    el('button', { class: 'btn small', text: 'Archive', onclick: () => bulk('archive') }),
    el('button', { class: 'btn small', text: 'Move to trash', onclick: () => bulk('trash') }),
    el('button', { class: 'btn small', text: 'Restore', onclick: () => bulk('restore') }),
    el('button', { class: 'btn small', text: 'Duplicate', onclick: () => bulk('duplicate') }),
    el('button', { class: 'btn small', text: 'Move…', onclick: () => bulkMove() }),
    el('button', { class: 'btn small danger', text: 'Delete forever', onclick: () => bulk('delete') }),
  );
  return bar;
}

function renderEmptyState() {
  return el('div', { class: 'empty-state', style: 'margin-top:24px' }, [
    el('div', { class: 'big', text: 'No projects' }),
    el('div', { style: 'font-size:14px;color:#ccc;margin-bottom:12px', text: 'Create your first project' }),
    el('div', { style: 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap' }, [
      el('button', { class: 'btn primary', text: 'Blank Email', onclick: () => createProjectFrom('blank') }),
      el('button', { class: 'btn', text: 'Welcome Email', onclick: () => createProjectFrom('welcome') }),
      el('button', { class: 'btn', text: 'Newsletter', onclick: () => createProjectFrom('newsletter') }),
    ]),
  ]);
}

async function createProjectFrom(key) {
  try {
    let project;
    if (key === 'blank') {
      project = await createProject({ name: 'Untitled email', html: '', css: '' });
    } else {
      const res = await api.get(`/api/templates/${key}`);
      project = await createProject({ name: res.template.name, html: res.template.html, css: res.template.css });
    }
    location.hash = `#workspace/${project.id}`;
  } catch (e) {
    toast(`Failed: ${e.message}`, 'error');
  }
}

function renderList(listEl) {
  clear(listEl);
  if (!state.projects.length) {
    listEl.append(el('div', { class: 'empty-state', text: 'No projects match these filters.' }));
    return;
  }
  for (const p of state.projects) {
    const checked = selected.has(p.id);
    const cb = el('input', { type: 'checkbox' });
    cb.checked = checked;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(p.id);
      else selected.delete(p.id);
      const bar = document.getElementById('project-bulk');
      if (bar) {
        bar.style.display = selected.size ? 'flex' : 'none';
        const label = bar.querySelector('.hint');
        if (label) label.textContent = `${selected.size} selected`;
      }
    });
    const tags = (p.tags || []).map((t) => el('span', { class: 'chip', text: t }));
    const item = el('div', { class: 'card-list-item' }, [
      cb,
      el('div', { class: 'body', onclick: () => { location.hash = `#workspace/${p.id}`; } }, [
        el('div', { class: 'name' }, [
          p.favorite ? el('span', { class: 'fav', text: '*' }) : null,
          el('span', { text: p.name }),
        ]),
        el('div', { class: 'meta', text: metaLine(p) }),
        tags.length ? el('div', { class: 'chip-row' }, tags) : null,
      ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn icon small', title: p.favorite ? 'Unfavorite' : 'Favorite', text: p.favorite ? '*' : '.', onclick: () => toggleFavorite(p) }),
        el('button', { class: 'btn icon small', title: 'Open', text: 'Open', onclick: () => { location.hash = `#workspace/${p.id}`; } }),
        el('button', { class: 'btn icon small', title: 'Duplicate', text: 'Copy', onclick: () => duplicateProject(p) }),
        el('button', { class: 'btn icon small', title: 'Export', text: 'ZIP', onclick: () => exportProject(p) }),
        filters.view === 'trashed'
          ? el('button', { class: 'btn icon small', title: 'Restore', text: 'Restore', onclick: () => restoreProject(p) })
          : el('button', { class: 'btn icon small', title: p.archived ? 'Unarchive' : 'Archive', text: p.archived ? 'Unarchive' : 'Archive', onclick: () => archiveProject(p) }),
        filters.view === 'trashed'
          ? el('button', { class: 'btn icon small danger', title: 'Delete forever', text: 'Delete', onclick: () => deleteProject(p) })
          : el('button', { class: 'btn icon small danger', title: 'Move to trash', text: 'Trash', onclick: () => trashProject(p) }),
      ]),
    ]);
    listEl.append(item);
  }
}

function metaLine(p) {
  const bits = [`Updated ${timeAgo(p.updated_at)}`];
  if (p.folder_id) {
    const f = (state.folders || []).find((x) => x.id === p.folder_id);
    if (f) bits.push(f.name);
  }
  if (p.subject) bits.push(p.subject);
  if (p.archived) bits.push('archived');
  if (p.trashed) bits.push('in trash');
  return bits.join(' · ');
}

function uniqueTags() {
  const set = new Set();
  for (const p of state.projects || []) for (const t of p.tags || []) set.add(t);
  return [...set].sort();
}

function queryParams() {
  const params = { q: filters.q, folderId: filters.folderId, tag: filters.tag, sort: filters.sort };
  if (filters.view === 'favorites') params.favorite = true;
  if (filters.view === 'archived') params.archived = true;
  if (filters.view === 'trashed') params.trashed = true;
  return params;
}

async function reload() {
  await renderProjects();
}

async function duplicateProject(p) {
  try {
    const res = await api.post(`/api/projects/${p.id}/duplicate`);
    toast(`Duplicated as "${res.project.name}"`, 'success');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function trashProject(p) {
  const ok = await confirmDialog('Move to trash', `Move "${p.name}" to trash?`, 'Trash', true);
  if (!ok) return;
  try {
    await api.put(`/api/projects/${p.id}`, { trashed: true });
    toast('Moved to trash', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function restoreProject(p) {
  try {
    await api.put(`/api/projects/${p.id}`, { trashed: false, archived: false });
    toast('Restored', 'success');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function archiveProject(p) {
  try {
    await api.put(`/api/projects/${p.id}`, { archived: !p.archived });
    toast(p.archived ? 'Unarchived' : 'Archived', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleFavorite(p) {
  try {
    await api.put(`/api/projects/${p.id}`, { favorite: !p.favorite });
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteProject(p) {
  const ok = await confirmDialog('Delete project', `Permanently delete "${p.name}"? This cannot be undone.`);
  if (!ok) return;
  try {
    await api.del(`/api/projects/${p.id}`);
    toast('Project deleted', 'info');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function exportProject(p) {
  try {
    const a = el('a', { href: `/api/projects/${p.id}/export?format=zip` });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Exporting project as ZIP', 'info');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function bulk(action) {
  const ids = [...selected];
  if (!ids.length) return;
  if (action === 'delete') {
    const ok = await confirmDialog('Delete projects', `Permanently delete ${ids.length} project(s)?`);
    if (!ok) return;
  }
  try {
    await api.post('/api/projects/bulk', { ids, action });
    selected.clear();
    toast('Updated ' + ids.length + ' project(s)', 'success');
    await reload();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function bulkMove() {
  const ids = [...selected];
  if (!ids.length) return;
  const sel = el('select', {}, [
    el('option', { value: '', text: 'Unfiled' }),
    ...(state.folders || []).map((f) => el('option', { value: f.id, text: f.name })),
  ]);
  const body = el('div', { class: 'modal-body' }, [el('div', { class: 'field' }, [el('label', { text: 'Folder' }), sel])]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: 'Move', onclick: async () => {
      try {
        await api.post('/api/projects/bulk', { ids, action: 'move', folderId: sel.value || null });
        selected.clear();
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
    el('div', { class: 'modal-head' }, [el('h2', { text: 'Move projects' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]));
  document.body.append(backdrop);
}

async function folderDialog() {
  const nameInput = el('input', { type: 'text', placeholder: 'Folder name' });
  const body = el('div', { class: 'modal-body' }, [el('div', { class: 'field' }, [el('label', { text: 'Name' }), nameInput])]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
    el('button', { class: 'btn primary', text: 'Create', onclick: async () => {
      const name = nameInput.value.trim();
      if (!name) { toast('Name required', 'warn'); return; }
      try {
        await api.post('/api/folders', { name });
        toast('Folder created', 'success');
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
    el('div', { class: 'modal-head' }, [el('h2', { text: 'New folder' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]));
  document.body.append(backdrop);
  nameInput.focus();
}

async function importDialog() {
  const fileInput = el('input', { type: 'file', accept: '.html,.htm,text/html', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const name = file.name.replace(/\.(html?)$/i, '') || 'Imported email';
      const res = await api.post('/api/projects/import', { name, html: text });
      toast('Project imported', 'success');
      location.hash = `#workspace/${res.project.id}`;
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error');
    }
  });
  fileInput.click();
}

async function createProjectDialog() {
  const nameInput = el('input', { type: 'text', placeholder: 'Campaign name', value: 'Untitled email' });
  const body = el('div', { class: 'modal-body' }, [
    el('div', { class: 'field' }, [el('label', { text: 'Project name' }), nameInput]),
  ]);
  const foot = el('div', { class: 'modal-foot' }, [
    el('button', { class: 'btn', text: 'Cancel' }),
    el('button', { class: 'btn primary', text: 'Create' }),
  ]);
  let close = () => {};
  const backdrop = el('div', { class: 'modal-backdrop' });
  close = () => backdrop.remove();
  foot.querySelectorAll('button')[0].addEventListener('click', close);
  foot.querySelectorAll('button')[1].addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Untitled email';
    try {
      const project = await createProject({ name, html: '', css: '' });
      close();
      location.hash = `#workspace/${project.id}`;
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [el('h2', { text: 'New project' }), el('button', { class: 'x', html: '&times;', onclick: close })]),
    body,
    foot,
  ]);
  backdrop.append(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  nameInput.focus();
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function refresh() {
  if (state.view === 'projects') renderProjects();
}
