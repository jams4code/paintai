use std::path::{Path, PathBuf};

/// Largest file the renderer is allowed to pull in or write out.
///
/// Scenes are JSON and screenshots are PNGs, so anything past this is either a
/// mistake or someone pointing the app at something it has no business reading.
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;

/// Resolve a renderer-supplied path into something safe to touch.
///
/// The renderer only ever sends back paths the user picked in a native dialog,
/// but it is still untrusted input: the webview is the least trustworthy part of
/// the process, and a canvas can hold text an agent wrote. Canonicalising kills
/// traversal and resolves symlinks to their real target, so what is checked here
/// is what actually gets opened.
fn resolve_existing(path: &str) -> Result<PathBuf, String> {
    let resolved = std::fs::canonicalize(path).map_err(|e| format!("cannot resolve path: {e}"))?;

    if !resolved.is_file() {
        return Err("not a regular file".into());
    }

    let size = resolved
        .metadata()
        .map_err(|e| format!("cannot stat file: {e}"))?
        .len();

    if size > MAX_FILE_BYTES {
        return Err(format!("file is {size} bytes, limit is {MAX_FILE_BYTES}"));
    }

    Ok(resolved)
}

/// Read a user-selected file as raw bytes.
///
/// Returns an `ipc::Response` rather than a `Vec<u8>` so the bytes cross the IPC
/// boundary raw and land as an ArrayBuffer. Serialised as a plain `Vec<u8>` a
/// screenshot becomes a JSON array of several million integers, which is roughly
/// four times the size and far slower to parse.
#[tauri::command]
fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let resolved = resolve_existing(&path)?;
    let bytes = std::fs::read(&resolved).map_err(|e| format!("cannot read file: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Write bytes to a user-selected destination.
///
/// The parent directory must already exist. Directories are never created, so a
/// typo in a path fails loudly instead of scattering folders around the disk.
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    if contents.len() as u64 > MAX_FILE_BYTES {
        return Err("refusing to write, payload over limit".into());
    }

    let target = Path::new(&path);
    let parent = target
        .parent()
        .ok_or("destination has no parent directory")?;

    let parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("destination directory does not exist: {e}"))?;

    let name = target.file_name().ok_or("destination has no file name")?;

    std::fs::write(parent.join(name), contents).map_err(|e| format!("cannot write file: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
