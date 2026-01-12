import axios, { AxiosHeaders } from 'axios';

const getDefaultApiBaseUrl = () => {
  const { hostname, protocol } = window.location;
  if (protocol === 'file:') {
    return 'https://tracker.webndevs.com/api';
  }

  // If running on localhost/127.0.0.1, assume dev mode with port 8000
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8000/api`;
  }

  // In production (served via Nginx on same domain), use relative path
  return '/api';
};

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!envUrl) return getDefaultApiBaseUrl();

  try {
    if (window.location.protocol !== 'file:') {
      const parsed = new URL(envUrl);
      if (parsed.hostname !== window.location.hostname) {
        return getDefaultApiBaseUrl();
      }
    }
  } catch {
    return getDefaultApiBaseUrl();
  }

  return envUrl;
};

const API_BASE_URL = getApiBaseUrl();

const AUTH_STORAGE_KEY = 'auth-storage';
const AUTH_LAST_USED_KEY = 'auth-last-used-at';
const AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getLoginUrl = () => {
  const base = window.location.href.split('#')[0];
  return `${base}#/login`;
};

const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem(AUTH_LAST_USED_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: window.location.protocol !== 'file:',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor for auth TTL tracking + Desktop token injection
api.interceptors.request.use((config) => {
  const now = Date.now();
  const lastUsedRaw = localStorage.getItem(AUTH_LAST_USED_KEY);
  const lastUsed = lastUsedRaw ? Number(lastUsedRaw) : NaN;
  if (Number.isFinite(lastUsed) && now - lastUsed > AUTH_TTL_MS) {
    clearAuth();
    if (!window.location.hash.startsWith('#/login')) {
      window.location.href = getLoginUrl();
    }
    return Promise.reject(new Error('Auth expired'));
  }

  const token = localStorage.getItem('token');
  if (token && window.location.protocol === 'file:') {
    if (config.headers instanceof AxiosHeaders) {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else if (config.headers) {
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    } else {
      config.headers = new AxiosHeaders({ Authorization: `Bearer ${token}` });
    }
  }

  localStorage.setItem(AUTH_LAST_USED_KEY, String(now));
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      if (!window.location.hash.startsWith('#/login')) {
        window.location.href = getLoginUrl();
      }
    }
    return Promise.reject(error);
  }
);
