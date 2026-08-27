import { el, toast } from '../ui.js';
import { api, setCsrf } from '../api.js';
import { state, set } from '../state.js';

function authShell(title, subtitle, body, onSubmit) {
  const errorBox = el('div', { class: 'auth-error', style: 'display:none' });
  const form = el('form', {}, [body, errorBox]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    try {
      await onSubmit(form);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    }
  });
  const card = el('div', { class: 'auth-card' }, [
    el('div', { class: 'logo', text: 'EMAIL STUDIO' }),
    el('div', { class: 'tagline', text: subtitle }),
    el('h1', { text: title }),
    form,
  ]);
  return el('div', { class: 'auth-screen' }, [card]);
}

export function renderSetup() {
  const body = [
    el('div', { class: 'field' }, [
      el('label', { text: 'Username' }),
      el('input', { type: 'text', name: 'username', autocomplete: 'username', required: true }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Password' }),
      el('input', { type: 'password', name: 'password', autocomplete: 'new-password', required: true, minlength: '8' }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Confirm password' }),
      el('input', { type: 'password', name: 'confirm', autocomplete: 'new-password', required: true }),
    ]),
    el('button', { class: 'btn primary', type: 'submit', text: 'Create administrator' }),
  ];
  const screen = authShell('Set up your instance', 'Create the local administrator account', body, async (form) => {
    const data = new FormData(form);
    const res = await api.post('/api/auth/setup', {
      username: data.get('username'),
      password: data.get('password'),
      confirm: data.get('confirm'),
    });
    if (res.csrf) setCsrf(res.csrf);
    set({ user: res.user, needsSetup: false });
    toast('Administrator created. Welcome!', 'success');
    location.hash = '#projects';
  });
  return screen;
}

export function renderLogin() {
  const body = [
    el('div', { class: 'field' }, [
      el('label', { text: 'Username' }),
      el('input', { type: 'text', name: 'username', autocomplete: 'username', required: true }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Password' }),
      el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true }),
    ]),
    el('button', { class: 'btn primary', type: 'submit', text: 'Sign in' }),
  ];
  const screen = authShell('Sign in', 'Welcome back to your email workspace', body, async (form) => {
    const data = new FormData(form);
    const res = await api.post('/api/auth/login', {
      username: data.get('username'),
      password: data.get('password'),
    });
    if (res.csrf) setCsrf(res.csrf);
    set({ user: res.user });
    toast('Signed in', 'success');
    location.hash = '#projects';
  });
  return screen;
}
