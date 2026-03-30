use std::path::Path;

#[tauri::command]
pub fn save_thumbnail(image_data: String, output_path: String) -> Result<String, String> {
    let data = image_data
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&image_data);

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let path = Path::new(&output_path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(path, &bytes).map_err(|e| format!("Failed to write thumbnail: {}", e))?;

    Ok(output_path)
}

#[tauri::command]
pub fn save_text_file(content: String, output_path: String) -> Result<String, String> {
    let path = Path::new(&output_path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}
