use log::info;
use std::path::Path;

/// Opens the platform file manager with `path` selected.
pub fn reveal_path(path: &Path) -> Result<(), String> {
    info!("Revealing in file manager: {}", path.display());

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        // "open -R" reveals the item, avoiding macOS treating .app paths as apps
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // xdg-open cannot select an item, so open the containing folder.
        let target = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path no longer exists: {}", path));
    }
    reveal_path(target)
}
