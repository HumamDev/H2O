// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Desktop binary entry point. The actual Tauri builder body lives in
// `lib.rs` so the same `run()` can be reused by future mobile targets.
fn main() {
    h2o_studio_desktop_lib::run()
}
