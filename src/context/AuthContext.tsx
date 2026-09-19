import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, SystemSetupStatus } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  setupStatus: SystemSetupStatus | null;
  isCheckingSetup: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, role?: User['role']) => Promise<void>;
  setup: (name: string, email: string, pass: string, companyName: string, seedDemoData: boolean, postgresUrl?: string) => Promise<any>;
  checkSetupStatus: () => Promise<boolean>;
  refreshSetupStatus: () => Promise<SystemSetupStatus | null>;
  setupDatabase: (postgresUrl: string) => Promise<{ success: boolean; message: string; tablesCreated?: string[] }>;
  updateUser: (updatedUser: User) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isLoading: boolean;
  firebaseUser: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser] = useState<any>(null);
  const [setupStatus, setSetupStatus] = useState<SystemSetupStatus | null>(null);
  const [isCheckingSetup, setIsCheckingSetup] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(() => {
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

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('dashboard_token') || null;
  });

  const [isLoading, setIsLoading] = useState(false);

  const refreshSetupStatus = async (): Promise<SystemSetupStatus | null> => {
    try {
      const res = await fetch('/api/auth/setup-status');
      if (res.ok) {
        const data: SystemSetupStatus = await res.json();
        setSetupStatus(data);
        return data;
      }
    } catch (err) {
      console.warn('[AuthContext] setup-status check failed:', err);
    } finally {
      setIsCheckingSetup(false);
    }
    return null;
  };

  useEffect(() => {
    refreshSetupStatus();
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('dashboard_token');
    if (savedToken) {
      refreshUser();
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('dashboard_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('dashboard_user');
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('dashboard_token', token);
    } else {
      localStorage.removeItem('dashboard_token');
    }
  }, [token]);

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

      // Save to localStorage IMMEDIATELY before state updates
      localStorage.setItem('dashboard_token', data.token);
      localStorage.setItem('dashboard_user', JSON.stringify(userData));

      setUser(userData);
      setToken(data.token);
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

  const setup = async (
    name: string,
    email: string,
    pass: string,
    companyName: string,
    seedDemoData: boolean,
    postgresUrl?: string
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password: pass, companyName, seedDemoData, postgresUrl }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Sunucudan geçersiz yanıt alındı.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Onboarding kurulum işlemi başarısız.');
      }

      const userData = data.user;
      localStorage.setItem('dashboard_token', data.token);
      localStorage.setItem('dashboard_user', JSON.stringify(userData));

      setUser(userData);
      setToken(data.token);

      // Refresh setup status
      await refreshSetupStatus();
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const setupDatabase = async (postgresUrl: string): Promise<{ success: boolean; message: string; tablesCreated?: string[] }> => {
    setIsLoading(true);
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (savedToken) {
        headers['Authorization'] = `Bearer ${savedToken}`;
      }

      const res = await fetch('/api/auth/setup-database', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ postgresUrl }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'PostgreSQL yapılandırma işlemi başarısız oldu.');
      }

      await refreshSetupStatus();
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/setup-status');
      const data = await res.json();
      setSetupStatus(data);
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
    setUser(null);
    setToken(null);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('[AuthContext] Oturum süresi doldu veya geçersiz jeton tespit edildi. Oturum temizleniyor...');
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const refreshUser = async (): Promise<User | null> => {
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const headers: Record<string, string> = {};
      if (savedToken) {
        headers['Authorization'] = `Bearer ${savedToken}`;
      }
      const res = await fetch('/api/profile', {
        headers,
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
        token,
        setupStatus,
        isCheckingSetup,
        login,
        register,
        setup,
        checkSetupStatus,
        refreshSetupStatus,
        setupDatabase,
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

