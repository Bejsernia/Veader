const leases = new Map<string, number>();

/** A lease protects a cache file (or an explicitly slash-terminated directory). */
export function acquireCacheLease(uri: string): () => void {
  leases.set(uri, (leases.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (leases.get(uri) ?? 1) - 1;
    if (count > 0) leases.set(uri, count);
    else leases.delete(uri);
  };
}

export function isCacheLeased(uri: string) {
  for (const key of leases.keys()) {
    if (uri === key || (key.endsWith('/') && uri.startsWith(key))) return true;
  }
  return false;
}

export function hasCacheLeaseUnder(root: string) {
  return [...leases.keys()].some(uri => uri.startsWith(root));
}
