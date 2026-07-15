// Thin fetch wrapper around the Hustlify JSON API. Throws an Error carrying the
// server's message (and status) so views can surface friendly feedback.
async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  if (res.status === 401) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  getSettings: () => req('GET', '/settings'),
  login: (password) => req('POST', '/login', { password }),
  logout: () => req('POST', '/logout'),

  listCategories: (all = false) => req('GET', `/categories${all ? '?all=true' : ''}`),
  createCategory: (data) => req('POST', '/categories', data),
  updateCategory: (id, data) => req('PATCH', `/categories/${id}`, data),
  deleteCategory: (id) => req('DELETE', `/categories/${id}`),

  listEntries: (params = {}) => req('GET', `/entries${queryString(params)}`),
  createEntry: (data) => req('POST', '/entries', data),
  updateEntry: (id, data) => req('PATCH', `/entries/${id}`, data),
  deleteEntry: (id) => req('DELETE', `/entries/${id}`),

  getTimer: () => req('GET', '/timer'),
  startTimer: (data) => req('POST', '/timer/start', data),
  stopTimer: () => req('POST', '/timer/stop'),

  getStats: (range) => req('GET', `/stats?range=${range}`),
};

export function queryString(params) {
  const usable = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (!usable.length) return '';
  return '?' + usable.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
