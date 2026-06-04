import { api } from '../lib/api';
import { User } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  role?: 'admin' | 'employee';
  department?: string;
  position?: string;
  phone?: string;
}

export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<{ user: User }> => {
    const response = await api.post('/login', credentials);
    const { user, token } = response.data;
    
    // Store token if provided (essential for Electron/Mobile)
    if (token) {
      localStorage.setItem('token', token);
    } else {
      // Fallback/Warning for debugging
      if (window.location.protocol === 'file:') {
        throw new Error('Live Server outdated: Backend must return an authentication token for Desktop App. Please update the server.');
      }
    }
    
    return { user };
  },

  register: async (data: RegisterData): Promise<{ user: User }> => {
    const response = await api.post('/register', data);
    const { user } = response.data;
    return { user };
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/logout');
    } finally {
      localStorage.removeItem('token');
    }
  },

  getUser: async (): Promise<User> => {
    const response = await api.get('/user');
    // Backend returns { user: {...} }
    return response.data.user;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await api.put('/profile', data);
    return response.data.user ?? response.data;
  },

  updatePassword: async (data: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }): Promise<void> => {
    await api.put('/password', data);
  },

  send2FaOtp: async (): Promise<{ message: string; email: string }> => {
    const response = await api.post('/2fa/send');
    return response.data;
  },

  verify2FaOtp: async (code: string, method: 'email' | 'totp' | 'backup'): Promise<{ message: string; verified: boolean }> => {
    const response = await api.post('/2fa/verify', { code, method });
    return response.data;
  },

  get2FaStatus: async (): Promise<{ verified: boolean }> => {
    const response = await api.get('/2fa/status');
    return response.data;
  },

  get2FaStatusFull: async (): Promise<{ verified: boolean; methods: ('email' | 'totp' | 'backup')[]; default_method?: 'email' | 'totp' | 'backup' }> => {
    const response = await api.get('/2fa/status');
    return response.data;
  },

  get2FaSettings: async (): Promise<{ enabled: boolean; method: 'email' | 'totp' | 'both'; totp_configured: boolean; backup_codes_configured: boolean; remaining_backup_codes: number; email: string }> => {
    const response = await api.get('/2fa/settings');
    return response.data;
  },

  update2FaSettings: async (payload: { enabled: boolean; method: 'email' | 'totp' | 'both' }): Promise<{ message: string; enabled: boolean; method: 'email' | 'totp' | 'both' }> => {
    const response = await api.post('/2fa/settings', payload);
    return response.data;
  },

  setupTotp: async (): Promise<{ secret: string; qr_code_url: string }> => {
    const response = await api.post('/2fa/totp/setup');
    return response.data;
  },

  verifyTotpSetup: async (code: string): Promise<{ message: string; enabled: boolean; method: string }> => {
    const response = await api.post('/2fa/totp/verify', { code });
    return response.data;
  },

  generateBackupCodes: async (): Promise<{ message: string; codes: string[] }> => {
    const response = await api.post('/2fa/backup-codes/generate');
    return response.data;
  },

  disconnectTotp: async (): Promise<{ message: string; enabled: boolean; method: 'email' | 'totp' | 'both'; totp_configured: boolean }> => {
    const response = await api.post('/2fa/totp/disconnect');
    return response.data;
  },
};
