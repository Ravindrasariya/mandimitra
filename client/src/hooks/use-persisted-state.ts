import { useState, useEffect, useCallback } from "react";

export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `mandi-mitra-${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch {}
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [storageKey, state]);

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
    setState(defaultValue);
  }, [storageKey, defaultValue]);

  return [state, setState, clear];
}
