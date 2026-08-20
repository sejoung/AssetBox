import type { SortMode } from "./fileTree";

const STORAGE_KEY = "assetbox.treeSession";

export interface TreeSession {
  location: string | null;
  expanded: string[];
  sort: SortMode;
  modelsOnly: boolean;
  width: number;
}

export const DEFAULT_SESSION: TreeSession = {
  location: null,
  expanded: [],
  sort: "name",
  modelsOnly: true,
  width: 280,
};

const SORT_MODES: SortMode[] = ["name", "size", "modified"];

/** Restores the last session, ignoring anything malformed field by field. */
export function loadSession(): TreeSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SESSION;
    const candidate = parsed as Partial<TreeSession>;

    return {
      location: typeof candidate.location === "string" ? candidate.location : null,
      expanded: Array.isArray(candidate.expanded)
        ? candidate.expanded.filter((path): path is string => typeof path === "string")
        : [],
      sort:
        typeof candidate.sort === "string" && SORT_MODES.includes(candidate.sort as SortMode)
          ? (candidate.sort as SortMode)
          : DEFAULT_SESSION.sort,
      modelsOnly:
        typeof candidate.modelsOnly === "boolean"
          ? candidate.modelsOnly
          : DEFAULT_SESSION.modelsOnly,
      width:
        typeof candidate.width === "number" && Number.isFinite(candidate.width)
          ? candidate.width
          : DEFAULT_SESSION.width,
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSession(patch: Partial<TreeSession>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSession(), ...patch }));
  } catch {
    // Storage unavailable — session restore is best effort.
  }
}
