import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import TimeTracking from './pages/TimeTracking';
import Timesheets from './pages/Timesheets';
import { authAPI } from './api/auth';
import { useAuthStore } from './stores/authStore';

const queryClient = new QueryClient();

const AUTH_LAST_USED_KEY = 'auth-last-used-at';
const AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getLoginUrl = () => {
  const base = window.location.href.split('#')[0];
  return `${base}#/login`;
};

function AppContent() {
  const location = useLocation();
  const { login, logout, setAuthChecked } = useAuthStore();

  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');

    const now = Date.now();
    const lastUsedRaw = localStorage.getItem(AUTH_LAST_USED_KEY);
    const lastUsed = lastUsedRaw ? Number(lastUsedRaw) : NaN;

    if (Number.isFinite(lastUsed) && now - lastUsed > AUTH_TTL_MS) {
      logout();
      setAuthChecked(true);
      window.location.href = getLoginUrl();
      return;
    }

    if (!lastUsedRaw) {
      localStorage.setItem(AUTH_LAST_USED_KEY, String(now));
    }

    let cancelled = false;
    authAPI.getUser()
      .then((user) => {
        if (cancelled) return;
        login(user);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        logout();
        setAuthChecked(true);
        if (!window.location.hash.startsWith('#/login')) {
          window.location.href = getLoginUrl();
        }
      });

    return () => { cancelled = true; };
  }, [location.pathname, login, logout, setAuthChecked]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/employees" element={<ProtectedRoute requiredRole="admin"><Employees /></ProtectedRoute>} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/time-tracking" element={<TimeTracking />} />
                <Route path="/timesheets" element={<Timesheets />} />
                <Route path="/" element={<Dashboard />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppContent />
        <Toaster position="top-right" />
      </Router>
    </QueryClientProvider>
  );
}
