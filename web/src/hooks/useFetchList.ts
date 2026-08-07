"use client";

import { useCallback, useEffect, useState } from "react";

type UseFetchListOptions = {
  /** JSON key for the array (default: items) */
  key?: string;
  /** Skip initial fetch */
  skip?: boolean;
};

export function useFetchList<T>(
  url: string,
  options: UseFetchListOptions = {}
) {
  const { key = "items", skip = false } = options;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error || `Request failed (${r.status})`);
      }
      setItems((d[key] as T[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    if (!skip) load();
  }, [load, skip]);

  return { items, loading, error, reload: load, setItems };
}
