import { create } from 'zustand';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department?: string;
  position?: string;
  status: 'active' | 'inactive';
  hire_date?: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  authChecked: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setAuthChecked: (checked: boolean) => void;
}

const AUTH_LAST_USED_KEY = 'auth-last-used-at';

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  authChecked: false,
  login: (user) => {
    set({ user, isAuthenticated: true, authChecked: true });
    localStorage.setItem(AUTH_LAST_USED_KEY, String(Date.now()));
  },
  logout: () => {
    set({ user: null, isAuthenticated: false, authChecked: true });
    localStorage.removeItem(AUTH_LAST_USED_KEY);
  },
  updateUser: (userData) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...userData } : null,
    }));
  },
  setAuthChecked: (checked) => {
    set({ authChecked: checked });
  },
}));
