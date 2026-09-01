import axios from 'axios';

/**
 * One configured axios instance for the whole app.
 *
 * Two interceptors do the boring work everywhere, once:
 *   request  → attach the JWT to every call
 *   response → if the token is rejected, log out and return to /login
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const TOKEN_KEY = 'fct_token';
export const USER_KEY = 'fct_user';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

/** Pull a readable message out of whatever shape the error arrives in. */
export const errorMessage = (err) =>
  err?.response?.data?.detail ||
  err?.response?.data?.error ||
  err?.message ||
  'Something went wrong.';

export default api;
