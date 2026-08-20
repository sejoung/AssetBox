use crate::commands::reveal::reveal_path;
use tauri::Manager;

#[tauri::command]
pub fn open_log_directory(app_handle: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log directory: {}", e))?;

    // Ensure the directory exists before opening
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    reveal_path(&log_dir)
}
