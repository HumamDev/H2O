// Tauri V2 entry point. Split into a library so the same `run()` function
// compiles into both the desktop binary (via src/main.rs) and any future
// mobile target (which compiles through the cdylib declared in Cargo.toml's
// [lib] section). This is the canonical Tauri V2 template shape.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running H2O Studio desktop")
}
