import { useCallback, useEffect, useState } from "react";

type Options<T> = {
  load: () => Promise<T>;
  intervalMs: number;
};

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function usePollingResource<T>({ load, intervalMs }: Options<T>): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const next = await load();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown request error");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
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

    void run();
    const timer = window.setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs, load]);

  return { data, loading, error, reload };
}
