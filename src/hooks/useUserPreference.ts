import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to get and set user-specific preferences stored in the database.
 * If the user is logged in, values are read from and saved to their database preferences.
 * Scoped localStorage caching is also maintained so multiple users on the same machine never collide.
 */
export function useUserPreference<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const { user, updatePreferences } = useAuth();

  const userScopedStorageKey = user ? `pref_${user.id}_${key}` : `pref_guest_${key}`;

  const value = useMemo<T>(() => {
    // 1. First priority: Database preferences on current user
    if (user?.preferences && key in user.preferences && user.preferences[key] !== undefined) {
      return user.preferences[key] as T;
    }

    // 2. Second priority: User-scoped localStorage cache
    try {
      const stored = localStorage.getItem(userScopedStorageKey);
      if (stored !== null) {
        try {
          return JSON.parse(stored) as T;
        } catch {
          return stored as unknown as T;
        }
      }

      // 3. Legacy global localStorage fallback (for migration of existing local browser state)
      const legacyStored = localStorage.getItem(key);
      if (legacyStored !== null) {
        try {
          return JSON.parse(legacyStored) as T;
        } catch {
          return legacyStored as unknown as T;
        }
      }
    } catch {
      // Storage access exception safe fallback
    }

    return defaultValue;
  }, [user?.preferences, userScopedStorageKey, key, defaultValue]);

  const setValue = useCallback(
    (valOrFn: T | ((prev: T) => T)) => {
      const nextVal = typeof valOrFn === 'function' ? (valOrFn as any)(value) : valOrFn;

      // Update user-scoped localStorage cache immediately
      try {
        localStorage.setItem(userScopedStorageKey, typeof nextVal === 'string' ? nextVal : JSON.stringify(nextVal));
      } catch {}

      // Persist to database for this user
      if (user) {
        updatePreferences({ [key]: nextVal }).catch((err) => {
          console.warn(`[useUserPreference] Error saving ${key}:`, err);
        });
      }
    },
    [user, userScopedStorageKey, key, value, updatePreferences]
  );

  return [value, setValue];
}
