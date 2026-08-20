mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(commands::file_tree::WatcherState::default())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(if cfg!(debug_assertions) {
          log::LevelFilter::Debug
        } else {
          log::LevelFilter::Info
        })
        .max_file_size(5_000_000) // 5MB per log file
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      commands::file_scan::scan_asset_directory,
      commands::file_tree::list_directory,
      commands::file_tree::is_directory,
      commands::file_tree::watch_directory,
      commands::file_tree::search_files,
      commands::reveal::reveal_in_file_manager,
      commands::thumbnail::save_thumbnail,
      commands::thumbnail::save_text_file,
      commands::log_dir::open_log_directory,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
