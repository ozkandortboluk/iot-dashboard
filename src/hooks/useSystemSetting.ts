import { useCallback, useMemo } from 'react';
import { useRealtime } from '../context/RealtimeContext';

/**
 * Hook to read and update shared system-wide configurations stored in the database.
 * If user is connected, values sync in real-time across all user sessions and tabs via WebSocket & LWW.
 * Falls back to local storage cache and defaultValue when offline.
 */
export function useSystemSetting<T>(
  key: string,
  defaultValue: T
): [T, (val: T | ((prev: T) => T)) => Promise<boolean>] {
  const { systemSettings, updateSystemSetting } = useRealtime();

  const value = useMemo<T>(() => {
    // 1. First priority: Database system settings from RealtimeContext
    if (systemSettings && key in systemSettings && systemSettings[key] !== undefined) {
      const stored = systemSettings[key];
      if (
        typeof stored === 'object' &&
        stored !== null &&
        'value' in stored &&
        Object.keys(stored).length <= 2 &&
        ('updatedAt' in stored || 'updated_at' in stored)
      ) {
        return stored.value as T;
      }
      return stored as T;
    }

    // 2. Second priority: Local storage cache
    try {
      const local = localStorage.getItem(`sys_setting_${key}`);
      if (local !== null) {
        try {
          return JSON.parse(local) as T;
        } catch {
          return local as unknown as T;
        }
      }
    } catch {}

    return defaultValue;
  }, [systemSettings, key, defaultValue]);

  const setValue = useCallback(
    async (valOrFn: T | ((prev: T) => T)): Promise<boolean> => {
      const nextVal = typeof valOrFn === 'function' ? (valOrFn as any)(value) : valOrFn;

      // Update local cache immediately
      try {
        localStorage.setItem(`sys_setting_${key}`, JSON.stringify(nextVal));
      } catch {}

      return await updateSystemSetting(key, nextVal);
    },
    [key, value, updateSystemSetting]
  );

  return [value, setValue];
}
