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

/// A single entry in the file tree. Serialized as camelCase to match the
/// frontend's `DirEntry` type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub file_size: u64,
    /// "dir" | "model" | "texture" | "other"
    pub kind: String,
    pub has_children: bool,
    pub thumbnail_path: Option<String>,
    /// Unix seconds; 0 when the platform does not report it.
    pub modified: u64,
}
