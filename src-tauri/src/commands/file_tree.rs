use crate::models::asset_info::DirEntryInfo;
use log::{info, warn};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const MODEL_EXTENSIONS: &[&str] = &["fbx", "glb", "gltf", "obj"];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "tga", "tiff", "tif", "bmp", "exr"];

/// Event emitted to the frontend whenever the watched directory tree changes.
pub const TREE_CHANGED_EVENT: &str = "file-tree-changed";

fn extension_of(path: &Path) -> String {
    path.extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
}

fn classify(path: &Path) -> &'static str {
    let ext = extension_of(path);
    if MODEL_EXTENSIONS.contains(&ext.as_str()) {
        "model"
    } else if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        "texture"
    } else {
        "other"
    }
}

/// Generated thumbnails live next to the model as `<stem>_thumbnail.png`
/// (see ThumbnailButton). They are hidden from the tree and surfaced as the
/// owning model's preview image instead.
fn is_generated_thumbnail(file_name: &str) -> bool {
    file_name.to_lowercase().ends_with("_thumbnail.png")
}

fn thumbnail_for(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy().to_string();
    let candidate = path.with_file_name(format!("{}_thumbnail.png", stem));
    if candidate.is_file() {
        Some(candidate.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Cheap, single-level probe used to decide whether to draw an expand arrow.
/// With `models_only` we only count directories and model files, so folders
/// holding nothing but textures do not render a chevron that expands to
/// an empty list.
fn has_relevant_children(dir: &Path, models_only: bool) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            return true;
        }
        if !models_only && !is_generated_thumbnail(&name) {
            return true;
        }
        if models_only && classify(&path) == "model" {
            return true;
        }
    }
    false
}

/// Lists a single directory level. Deliberately non-recursive: asset folders
/// routinely hold thousands of textures, so the tree loads one level at a time
/// as the user expands it.
#[tauri::command]
pub fn list_directory(path: String, models_only: bool) -> Result<Vec<DirEntryInfo>, String> {
    info!("list_directory: {} (models_only={})", path, models_only);
    let dir = Path::new(&path);

    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let entries = std::fs::read_dir(dir).map_err(|e| {
        warn!("Cannot read directory {}: {}", path, e);
        e.to_string()
    })?;

    let mut result = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let is_dir = entry_path.is_dir();

        if is_dir {
            result.push(DirEntryInfo {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: true,
                file_size: 0,
                kind: "dir".to_string(),
                has_children: has_relevant_children(&entry_path, models_only),
                thumbnail_path: None,
            });
            continue;
        }

        if is_generated_thumbnail(&name) {
            continue;
        }

        let kind = classify(&entry_path);
        if models_only && kind != "model" {
            continue;
        }

        let file_size = std::fs::metadata(&entry_path).map(|m| m.len()).unwrap_or(0);
        let thumbnail_path = if kind == "model" {
            thumbnail_for(&entry_path)
        } else {
            None
        };

        result.push(DirEntryInfo {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir: false,
            file_size,
            kind: kind.to_string(),
            has_children: false,
            thumbnail_path,
        });
    }

    // Directories first, then case-insensitive name order.
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    info!("list_directory: {} entries", result.len());
    Ok(result)
}

/// Drag & drop hands us bare paths; the frontend needs to know whether a
/// dropped path should become the tree root or the selected model.
#[tauri::command]
pub fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

/// Watches `path` recursively and emits `file-tree-changed` on structural
/// changes. Only one directory is watched at a time: opening a new root
/// replaces the previous watcher. The frontend debounces the event.
#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Dropping the previous watcher unregisters it.
    *guard = None;

    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => {
                let structural = matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
                );
                if structural {
                    if let Err(e) = app_handle.emit(TREE_CHANGED_EVENT, ()) {
                        warn!("Failed to emit {}: {}", TREE_CHANGED_EVENT, e);
                    }
                }
            }
            Err(e) => warn!("Watch error: {}", e),
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    info!("watch_directory: watching {}", path);
    *guard = Some(watcher);
    Ok(())
}

/// Stops watching (used when the tree root is cleared).
#[tauri::command]
pub fn unwatch_directory(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Minimal scratch directory helper — the crate has no dev-dependencies.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!("assetbox_test_{}_{}", tag, std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            TempDir(path)
        }

        fn file(&self, name: &str) {
            fs::write(self.0.join(name), b"x").unwrap();
        }

        fn dir(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            fs::create_dir_all(&path).unwrap();
            path
        }

        fn path(&self) -> String {
            self.0.to_string_lossy().to_string()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn names(entries: &[DirEntryInfo]) -> Vec<String> {
        entries.iter().map(|e| e.name.clone()).collect()
    }

    #[test]
    fn lists_directories_first_then_files_case_insensitively() {
        let tmp = TempDir::new("sort");
        tmp.file("Zebra.glb");
        tmp.file("apple.glb");
        tmp.dir("textures");
        tmp.dir("Anims");

        let entries = list_directory(tmp.path(), false).unwrap();
        assert_eq!(names(&entries), ["Anims", "textures", "apple.glb", "Zebra.glb"]);
    }

    #[test]
    fn models_only_keeps_models_and_directories() {
        let tmp = TempDir::new("filter");
        tmp.file("hero.glb");
        tmp.file("hero_basecolor.png");
        tmp.file("notes.txt");
        tmp.dir("sub");

        let entries = list_directory(tmp.path(), true).unwrap();
        assert_eq!(names(&entries), ["sub", "hero.glb"]);

        let all = list_directory(tmp.path(), false).unwrap();
        assert_eq!(names(&all), ["sub", "hero.glb", "hero_basecolor.png", "notes.txt"]);
    }

    #[test]
    fn classifies_entries_and_reports_size() {
        let tmp = TempDir::new("kind");
        tmp.file("hero.FBX");
        tmp.file("wood.jpg");
        tmp.file("readme.md");

        let entries = list_directory(tmp.path(), false).unwrap();
        let kinds: Vec<&str> = entries.iter().map(|e| e.kind.as_str()).collect();
        assert_eq!(kinds, ["model", "other", "texture"]);
        assert!(entries.iter().all(|e| e.file_size == 1));
    }

    #[test]
    fn hides_dotfiles_and_generated_thumbnails() {
        let tmp = TempDir::new("hidden");
        tmp.file("hero.glb");
        tmp.file("hero_thumbnail.png");
        tmp.file(".DS_Store");
        tmp.dir(".git");

        let entries = list_directory(tmp.path(), false).unwrap();
        assert_eq!(names(&entries), ["hero.glb"]);
    }

    #[test]
    fn attaches_thumbnail_to_its_model() {
        let tmp = TempDir::new("thumb");
        tmp.file("hero.glb");
        tmp.file("hero_thumbnail.png");
        tmp.file("prop.glb");

        let entries = list_directory(tmp.path(), true).unwrap();
        let hero = entries.iter().find(|e| e.name == "hero.glb").unwrap();
        let prop = entries.iter().find(|e| e.name == "prop.glb").unwrap();

        assert!(hero.thumbnail_path.as_ref().unwrap().ends_with("hero_thumbnail.png"));
        assert!(prop.thumbnail_path.is_none());
    }

    #[test]
    fn has_children_respects_the_models_only_filter() {
        let tmp = TempDir::new("children");
        let textures = tmp.dir("textures_only");
        fs::write(textures.join("wood.png"), b"x").unwrap();
        let models = tmp.dir("with_model");
        fs::write(models.join("hero.glb"), b"x").unwrap();
        tmp.dir("empty");

        let filtered = list_directory(tmp.path(), true).unwrap();
        let flag = |name: &str| filtered.iter().find(|e| e.name == name).unwrap().has_children;
        assert!(!flag("textures_only"));
        assert!(flag("with_model"));
        assert!(!flag("empty"));

        let unfiltered = list_directory(tmp.path(), false).unwrap();
        assert!(unfiltered.iter().find(|e| e.name == "textures_only").unwrap().has_children);
    }

    #[test]
    fn rejects_paths_that_are_not_directories() {
        let tmp = TempDir::new("notdir");
        tmp.file("hero.glb");

        let file_path = tmp.0.join("hero.glb").to_string_lossy().to_string();
        assert!(list_directory(file_path.clone(), false).is_err());
        assert!(!is_directory(file_path));
        assert!(is_directory(tmp.path()));
        assert!(!is_directory("/nope/does/not/exist".to_string()));
    }
}
