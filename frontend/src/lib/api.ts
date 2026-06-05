import axios, { AxiosHeaders } from 'axios';
import { getEcho } from './echo';

const getDefaultApiBaseUrl = () => {
  const { hostname, protocol } = window.location;
  if (protocol === 'file:') {
    return 'https://tracker.webndevs.com/api';
  }

  // If running on localhost/127.0.0.1 or local network IP, assume dev mode with port 8000
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `${protocol}//${hostname}:8000/api`;
  }

  // Production: default to the live API domain
  // (Frontend and backend are deployed separately; do not rely on frontend Nginx proxying /api)
  return 'https://tracker.webndevs.com/api';
};

const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;
  return getDefaultApiBaseUrl();
};

const API_BASE_URL = getApiBaseUrl();
const IS_ABSOLUTE_API_URL = /^https?:\/\//i.test(API_BASE_URL);
const IS_NGROK = (() => {
  try {
    const hostFromBaseUrl = IS_ABSOLUTE_API_URL ? new URL(API_BASE_URL).hostname : window.location.hostname;
    return hostFromBaseUrl.endsWith('.ngrok-free.dev') || hostFromBaseUrl.endsWith('.ngrok.io');
  } catch {
    return false;
  }
})();

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
    ...(IS_NGROK ? { 'ngrok-skip-browser-warning': 'true' } : {}),
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

  try {
    const echo = getEcho();
    const socketId = echo?.socketId();
    if (socketId) {
      if (config.headers instanceof AxiosHeaders) {
        config.headers.set('X-Socket-ID', socketId);
      } else if (config.headers) {
        (config.headers as Record<string, string>)['X-Socket-ID'] = socketId;
      } else {
        config.headers = new AxiosHeaders({ 'X-Socket-ID': socketId });
      }
    }
  } catch (e) {
    // ignore
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
        return Promise.reject(error);
      }

      clearAuth();
      if (!window.location.hash.startsWith('#/login')) {
        window.location.href = getLoginUrl();
      }
    }

    if (error.response?.status === 403 && error.response?.data?.code === '2FA_REQUIRED') {
      // Clear local 2FA verified token on sessionStorage
      sessionStorage.removeItem('tt-2fa-verified');
      // Dispatch a custom window event so that the active Timesheets component re-locks itself immediately
      window.dispatchEvent(new Event('tt-2fa-required'));
    }
    return Promise.reject(error);
  }
);
