const STORAGE_KEY = "assetbox.recentFolders";
const MAX_ENTRIES = 5;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function getRecentFolders(): string[] {
  return read();
}

/** Most-recent-first, de-duplicated, capped. */
export function pushRecentFolder(path: string): string[] {
  const next = [path, ...read().filter((p) => p !== path)].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode / tests) — recents are best-effort.
  }
  return next;
}
