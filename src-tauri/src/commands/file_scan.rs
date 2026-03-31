use crate::models::asset_info::{ScanResult, ScannedTexture};
use log::{info, warn};
use std::path::Path;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "tga", "tiff", "tif", "bmp", "exr"];

#[tauri::command]
pub fn scan_asset_directory(file_path: String) -> Result<ScanResult, String> {
    info!("scan_asset_directory: {}", file_path);
    let path = Path::new(&file_path);

    let parent = path
        .parent()
        .ok_or_else(|| {
            warn!("Cannot determine parent directory for: {}", file_path);
            "Cannot determine parent directory".to_string()
        })?;

    let directory = parent.to_string_lossy().to_string();

    let model_file_size = std::fs::metadata(path)
        .map(|m| m.len())
        .unwrap_or(0);

    let mut sibling_files = Vec::new();
    let mut textures = Vec::new();

    let entries = std::fs::read_dir(parent).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }

        let file_name = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        sibling_files.push(entry_path.to_string_lossy().to_string());

        let ext = entry_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            let file_size = match std::fs::metadata(&entry_path) {
                Ok(m) => m.len(),
                Err(e) => {
                    warn!("Cannot read metadata for {}: {}", entry_path.display(), e);
                    continue;
                }
            };
            textures.push(ScannedTexture {
                file_name,
                file_path: entry_path.to_string_lossy().to_string(),
                file_size,
            });
        }
    }

    info!(
        "scan_asset_directory: found {} siblings, {} textures",
        sibling_files.len(),
        textures.len()
    );

    Ok(ScanResult {
        model_path: file_path,
        model_file_size,
        directory,
        sibling_files,
        textures,
    })
}
