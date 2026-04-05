"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "corex:direct-eip712-enabled";

export function useCorexDirectTxEnabled(defaultValue = false) {
  const [enabled, setEnabled] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setEnabled(true);
      } else if (stored === "false") {
        setEnabled(false);
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  const update = (value: boolean) => {
    setEnabled(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {}
  };

  return { enabled, setEnabled: update, hydrated };
}
