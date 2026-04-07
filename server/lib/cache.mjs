const cache = new Map();

function now() {
  return Date.now();
}

export async function cachedLoad(key, ttlMs, load) {
  const existing = cache.get(key);
  const currentTime = now();

  if (existing?.value && existing.expiresAt > currentTime) {
    return existing.value;
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  const inFlight = (async () => {
    try {
      const value = await load();
      cache.set(key, {
        value,
        expiresAt: now() + ttlMs,
        inFlight: null,
      });
      return value;
    } catch (error) {
      if (existing?.value) {
        cache.set(key, {
          value: existing.value,
          expiresAt: now() + Math.max(Math.floor(ttlMs / 4), 1000),
          inFlight: null,
        });
      } else {
        cache.delete(key);
      }
      throw error;
    }
  })();

  cache.set(key, {
    value: existing?.value || null,
    expiresAt: existing?.expiresAt || 0,
    inFlight,
  });

  return inFlight;
}
