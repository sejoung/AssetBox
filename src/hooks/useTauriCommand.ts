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
