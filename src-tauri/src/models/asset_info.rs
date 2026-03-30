use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedTexture {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub model_path: String,
    pub model_file_size: u64,
    pub directory: String,
    pub sibling_files: Vec<String>,
    pub textures: Vec<ScannedTexture>,
}
