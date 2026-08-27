let csrfToken = null;

export function setCsrf(token) {
  csrfToken = token;
}

export function getCsrf() {
  return csrfToken;
}

async function request(method, url, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  patch: (url, body) => request('PATCH', url, body || {}),
  del: (url) => request('DELETE', url),
  upload: async (url, file, extra = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(url, { method: 'POST', headers, credentials: 'same-origin', body: fd });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || `Upload failed (${res.status})`);
    return data;
  },
};
