// Peruse desktop shell.
//
// Deliberately minimal: Peruse's logic lives in the web layer and runs entirely
// on-device. The Rust side only hosts the webview. No custom commands, no
// network, no filesystem plugins are registered here — the smaller the native
// surface, the less there is to secure. Local file access is mediated by the
// webview's own File System Access API, gated behind the strict CSP declared in
// tauri.conf.json.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Peruse");
}
