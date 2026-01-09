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
    const { user } = response.data;
    return { user };
  },

  register: async (data: RegisterData): Promise<{ user: User }> => {
    const response = await api.post('/register', data);
    const { user } = response.data;
    return { user };
  },

  logout: async (): Promise<void> => {
    await api.post('/logout');
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
};
