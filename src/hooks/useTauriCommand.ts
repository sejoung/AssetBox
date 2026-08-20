import { invoke } from "@tauri-apps/api/core";

export interface ScanResult {
  model_path: string;
  model_file_size: number;
  directory: string;
  sibling_files: string[];
  textures: {
    file_name: string;
    file_path: string;
    file_size: number;
  }[];
}

export async function scanAssetDirectory(filePath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_asset_directory", { filePath });
}

export type EntryKind = "dir" | "model" | "texture" | "other";

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  fileSize: number;
  kind: EntryKind;
  hasChildren: boolean;
  thumbnailPath: string | null;
}

/** Lists one directory level. Non-recursive by design — the tree expands lazily. */
export async function listDirectory(path: string, modelsOnly: boolean): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_directory", { path, modelsOnly });
}

export async function isDirectory(path: string): Promise<boolean> {
  return invoke<boolean>("is_directory", { path });
}

/** Starts watching `path`; replaces any previously watched directory. */
export async function watchDirectory(path: string): Promise<void> {
  return invoke<void>("watch_directory", { path });
}

export async function unwatchDirectory(): Promise<void> {
  return invoke<void>("unwatch_directory");
}
