import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types';
import { apiFetch } from '../lib/apiFetch';

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, role?: User['role']) => Promise<void>;
  setup: (name: string, email: string, pass: string, companyName: string, seedDemoData: boolean) => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
  updateUser: (updatedUser: User) => void;
  updatePreferences: (newPrefs: Partial<NonNullable<User['preferences']>>) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isLoading: boolean;
  firebaseUser: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser] = useState<any>(null);
  const [user, setUser] = useState<User | null>(() => {
    // Purge legacy dashboard_token if any remnants remain in localStorage
    try {
      localStorage.removeItem('dashboard_token');
    } catch {}

    const saved = localStorage.getItem('dashboard_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u && u.id && u.email) {
          return u;
        }
      } catch {}
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
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
          'X-Request-Token': 'true',
        },
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

      const receivedToken =
        data.token ||
        res.headers.get('x-auth-token') ||
        res.headers.get('x-session-token') ||
        '';

      if (receivedToken) {
        sessionStorage.setItem('nexus_session_token', receivedToken);
        localStorage.setItem('nexus_session_token', receivedToken);
      }

      // Verify session with backend, falling back gracefully to Bearer session token if cookies are blocked by browser/iframe
      let userData = data.user;
      try {
        const verifyRes = await apiFetch('/api/auth/me', { skipUnauthorizedEvent: true });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyData.user) {
            userData = verifyData.user;
          }
        } else if (verifyRes.status === 401) {
          console.warn('[AuthContext] Session cookie not accepted or blocked by browser/iframe; utilizing Bearer session token fallback.');
        }
      } catch (verifyErr) {
        console.warn('[AuthContext] Session verification notice:', verifyErr);
      }

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
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
          'X-Request-Token': 'true',
        },
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

      const receivedToken =
        data.token ||
        res.headers.get('x-auth-token') ||
        res.headers.get('x-session-token') ||
        '';

      if (receivedToken) {
        sessionStorage.setItem('nexus_session_token', receivedToken);
        localStorage.setItem('nexus_session_token', receivedToken);
      }

      // Auto login and verify cookie
      await login(email, pass);
    } finally {
      setIsLoading(false);
    }
  };

  const setup = async (name: string, email: string, pass: string, companyName: string, _seedDemoData: boolean) => {
    setIsLoading(true);
    try {
      const activeSetupToken = sessionStorage.getItem('nexus_setup_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
        'X-Request-Token': 'true',
      };
      if (activeSetupToken) {
        headers['X-Setup-Token'] = activeSetupToken;
      }
      const res = await apiFetch('/api/setup/create-admin', {
        method: 'POST',
        headers,
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

      const receivedToken =
        data.token ||
        res.headers.get('x-auth-token') ||
        res.headers.get('x-session-token') ||
        '';

      if (receivedToken) {
        sessionStorage.setItem('nexus_session_token', receivedToken);
        localStorage.setItem('nexus_session_token', receivedToken);
      }

      // Verify session with backend, falling back gracefully to Bearer session token if cookies are blocked by browser/iframe
      let userData = data.user;
      try {
        const verifyRes = await apiFetch('/api/auth/me', { skipUnauthorizedEvent: true });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyData.user) {
            userData = verifyData.user;
          }
        } else if (verifyRes.status === 401) {
          console.warn('[AuthContext] Setup session cookie not accepted or blocked by browser/iframe; utilizing Bearer session token fallback.');
        }
      } catch (verifyErr) {
        console.warn('[AuthContext] Setup session verification notice:', verifyErr);
      }

      localStorage.removeItem('dashboard_token');
      localStorage.setItem('dashboard_user', JSON.stringify(userData));

      setUser(userData);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/auth/setup-status');
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
    } catch {}
  };

  const updatePreferences = async (newPrefs: Partial<NonNullable<User['preferences']>>) => {
    if (!user) return;
    const mergedPreferences = {
      ...(user.preferences || {}),
      ...newPrefs,
    };
    const updatedUser: User = {
      ...user,
      preferences: mergedPreferences,
    };
    // Optimistic local state update
    setUser(updatedUser);
    try {
      localStorage.setItem('dashboard_user', JSON.stringify(updatedUser));
    } catch {}

    try {
      const res = await apiFetch('/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.user) {
          setUser(data.user);
          try {
            localStorage.setItem('dashboard_user', JSON.stringify(data.user));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Preferences persist deferred:', err);
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch {}
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_user');
    localStorage.removeItem('nexus_session_token');
    sessionStorage.removeItem('nexus_session_token');
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
    // Only attempt refresh if there is a session token or saved user in storage
    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('nexus_session_token') || localStorage.getItem('nexus_session_token'))
      : null;
    const savedUser = typeof window !== 'undefined' ? localStorage.getItem('dashboard_user') : null;

    if (!token && !savedUser) {
      setUser(null);
      return null;
    }

    try {
      const res = await apiFetch('/api/auth/me', { skipUnauthorizedEvent: true });
      if (res.status === 401) {
        logout();
        return null;
      }
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        const freshUser = data.user;
        if (freshUser && freshUser.id) {
          updateUser(freshUser);
          return freshUser;
        }
      }
    } catch {}
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        setup,
        checkSetupStatus,
        updateUser,
        updatePreferences,
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
