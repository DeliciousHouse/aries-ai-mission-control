import { useCallback, useEffect, useState } from "react";

type Options<T> = {
  load: () => Promise<T>;
  intervalMs: number;
  enabled?: boolean;
  initialDelayMs?: number;
};

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  attempted: boolean;
  reload: () => Promise<void>;
};

export function usePollingResource<T>({ load, intervalMs, enabled = true, initialDelayMs = 0 }: Options<T>): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      setAttempted(true);
      const next = await load();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown request error");
    } finally {
      setLoading(false);
    }
  }, [enabled, load]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    if (!enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setAttempted(true);
        }
        const next = await load();
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown request error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    timer = window.setTimeout(() => {
      void run();
    }, initialDelayMs);
    const poller = window.setInterval(() => {
      void run();
    }, intervalMs);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(poller);
    };
  }, [enabled, initialDelayMs, intervalMs, load]);

  return { data, loading, error, attempted, reload };
}
