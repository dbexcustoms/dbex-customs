// Single place that knows the backend URL. Change API_BASE when deploying.
const API_BASE = window.DBEX_API_BASE || 'http://localhost:4000/api';

function getToken() { return localStorage.getItem('dbex_token'); }
function setToken(t) { localStorage.setItem('dbex_token', t); }
function clearToken() { localStorage.removeItem('dbex_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('dbex_user') || 'null'); } catch { return null; } }
function setUser(u) { localStorage.setItem('dbex_user', JSON.stringify(u)); }

async function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Ошибка запроса (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function requireLogin() {
  if (!getToken()) window.location.href = 'login.html';
}

function logout() {
  clearToken();
  localStorage.removeItem('dbex_user');
  window.location.href = 'index.html';
}

const STATUS_LABELS = {
  new: 'Новая',
  documents_review: 'Проверка документов',
  submitted_to_customs: 'Подана в таможню',
  cleared: 'Выпущена',
  rejected: 'Отклонена',
};

const TYPE_LABELS = { import: 'Импорт', export: 'Экспорт', transit: 'Транзит / T1' };

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
