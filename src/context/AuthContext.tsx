import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, role?: User['role']) => Promise<void>;
  setup: (name: string, email: string, pass: string, companyName: string, seedDemoData: boolean) => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
  updateUser: (updatedUser: User) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isLoading: boolean;
  firebaseUser: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser] = useState<any>(null);
  const [user, setUser] = useState<User | null>(() => {
    // Clean up any stale dashboard_token to prevent conflicting session states
    try {
      localStorage.removeItem('dashboard_token');
    } catch {
      // ignore
    }

    const saved = localStorage.getItem('dashboard_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u && u.id && u.email) {
          return u;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initial verification with backend session cookie
    refreshUser();
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('dashboard_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('dashboard_user');
    }
  }, [user]);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      // Local/Backend API Auth with HttpOnly cookie support
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: pass }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Sunucudan geçersiz yanıt alındı.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Giriş yapılamadı.');
      }

      const userData = data.user;

      localStorage.removeItem('dashboard_token');
      localStorage.setItem('dashboard_user', JSON.stringify(userData));
      localStorage.removeItem('nexus_active_tab');
      localStorage.removeItem('nexus_admin_selected_customer');

      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, pass: string, role?: User['role']) => {
    setIsLoading(true);
    try {
      // Backend API Registration
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password: pass, role }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Sunucudan geçersiz yanıt alındı.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kayıt başarısız.');
      }

      // Auto login
      await login(email, pass);
    } finally {
      setIsLoading(false);
    }
  };

  const setup = async (name: string, email: string, pass: string, companyName: string, _seedDemoData: boolean) => {
    setIsLoading(true);
    try {
      const activeSetupToken = sessionStorage.getItem('nexus_setup_token') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeSetupToken) {
        headers['X-Setup-Token'] = activeSetupToken;
      }
      const res = await fetch('/api/setup/create-admin', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name, email, password: pass, passwordConfirm: pass, companyName }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Sunucudan geçersiz yanıt alındı.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Onboarding kurulum işlemi başarısız.');
      }

      const userData = data.user;
      localStorage.removeItem('dashboard_token');
      localStorage.setItem('dashboard_user', JSON.stringify(userData));

      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/setup-status');
      const data = await res.json();
      return !!data.needSetup;
    } catch {
      return false;
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    try {
      localStorage.setItem('dashboard_user', JSON.stringify(updatedUser));
    } catch {
      // ignore
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_user');
    localStorage.removeItem('nexus_active_tab');
    localStorage.removeItem('nexus_admin_selected_customer');
    setUser(null);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('[AuthContext] Oturum süresi doldu veya oturum sonlandırıldı. Temizleniyor...');
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const refreshUser = async (): Promise<User | null> => {
    try {
      const res = await fetch('/api/profile', {
        credentials: 'include',
      });
      if (res.status === 401) {
        logout();
        return null;
      }
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const freshUser = await res.json();
        if (freshUser && freshUser.id) {
          updateUser(freshUser);
          return freshUser;
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        login,
        register,
        setup,
        checkSetupStatus,
        updateUser,
        refreshUser,
        logout,
        isLoading,
        firebaseUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

