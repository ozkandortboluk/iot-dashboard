import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    // Graceful fallback if rendered outside AuthProvider
  }

  const user = authContext?.user;
  const updatePreferences = authContext?.updatePreferences;

  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('dashboard_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // Default to modern sleek dark mode
  });

  // Sync theme when user logs in or profile preferences are hydrated from the database
  useEffect(() => {
    if (user?.preferences?.theme) {
      const dbTheme = user.preferences.theme;
      if (dbTheme === 'light' || dbTheme === 'dark') {
        setThemeState(dbTheme);
      }
    }
  }, [user?.id, user?.preferences?.theme]);

  useEffect(() => {
    localStorage.setItem('dashboard_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    if (updatePreferences) {
      updatePreferences({ theme: nextTheme }).catch(() => {});
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (updatePreferences) {
      updatePreferences({ theme: newTheme }).catch(() => {});
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
