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

  // If served from the official domain, use relative /api (Nginx handles proxy)
  if (hostname === 'tracker.webndevs.com') {
    return '/api';
  }

  // If the frontend is served from another domain (e.g., shared preview), default to the live API.
  return 'https://tracker.webndevs.com/api';
};

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;
  return getDefaultApiBaseUrl();
};

const API_BASE_URL = getApiBaseUrl();
const IS_ABSOLUTE_API_URL = /^https?:\/\//i.test(API_BASE_URL);

const AUTH_STORAGE_KEY = 'auth-storage';
const AUTH_LAST_USED_KEY = 'auth-last-used-at';

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
  withCredentials: !IS_ABSOLUTE_API_URL && window.location.protocol !== 'file:',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor for auth TTL tracking + Desktop token injection
api.interceptors.request.use((config) => {
  const now = Date.now();

  const token = localStorage.getItem('token');
  if (token) {
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
      // Check if tracking is active before clearing auth
      const raw = localStorage.getItem('tt-tracker');
      const win = window as any;
      const coreRunning = win.__tt_core?.isTracking;
      let isTracking = false;

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          isTracking = !!parsed.isTracking;
        } catch { void 0; }
      }
      
      if (isTracking || coreRunning) {
        // DO NOT logout/clear auth if tracking is running.
        // This prevents automatic session timeout from stopping the tracker background work.
        console.warn('Auth 401 received but tracking is active. Ignoring auto-logout.');
        return Promise.reject(error);
      }

      clearAuth();
      if (!window.location.hash.startsWith('#/login')) {
        window.location.href = getLoginUrl();
      }
    }
    return Promise.reject(error);
  }
);
