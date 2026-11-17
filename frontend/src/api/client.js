const TOKEN_KEY = 'token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: object, form?: FormData }} [options]
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let fetchBody;
  if (form) {
    fetchBody = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const base = import.meta.env.VITE_API_BASE_URL || '';
  const res = await fetch(base + path, {
    method,
    headers,
    body: fetchBody,
  });

  const json = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearToken();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new Error(json.error || 'Unauthorized');
  }

  if (!res.ok) {
    throw new Error(json.error || 'Request failed');
  }

  return json;
}
