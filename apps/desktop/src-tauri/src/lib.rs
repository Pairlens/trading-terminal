// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

mod awake;
mod csp;

/// Window background while the webview has unpainted regions — matches the
/// app's dark `--background` token (oklch(13.5% 0.006 74) ≈ rgb(10, 8, 6)) so
/// early frames never flash white.
const WINDOW_BG: tauri::window::Color = tauri::window::Color(10, 8, 6, 255);

/// Called from the terminal frontend once the UI is ready to show.
#[tauri::command]
fn close_splashscreen(window: WebviewWindow) {
    // Show the requesting window before closing the splash so there is never
    // a frame with no window on screen.
    let _ = window.show();
    let _ = window.set_focus();
    if let Some(splash) = window.app_handle().get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}

/// Readiness watchdog: windows are created hidden and shown when the frontend
/// invokes `close_splashscreen`. If that signal never arrives (a boot error, a
/// route that doesn't emit it), show the window anyway so the app never looks
/// hung on the splash — or worse, invisible.
fn spawn_show_watchdog(window: WebviewWindow) {
    // Dev builds load from the Vite dev server, whose cold compile can take
    // far longer than a production boot.
    let timeout = if cfg!(debug_assertions) { 60 } else { 15 };
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(timeout));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
            if let Some(splash) = window.app_handle().get_webview_window("splashscreen") {
                let _ = splash.close();
            }
        }
    });
}

// ── Multi-window ────────────────────────────────────────────────────
//
// Additional terminal windows carry labels `terminal-2`, `terminal-3`, …
// (the first window keeps the label `main` from tauri.conf.json). The
// capability file allowlists `terminal-*` so secondary windows get the
// same permission set as the main window. Each window loads the same SPA;
// the frontend passes a path (e.g. a workspace route) so the new window
// opens on the content the user asked for.

/// Spawn a new terminal window. Sync command: macOS requires window
/// creation on the main thread. Returns the new window's label.
#[tauri::command]
fn open_terminal_window(
    app: AppHandle,
    window: WebviewWindow,
    path: Option<String>,
) -> Result<String, String> {
    let path = path.unwrap_or_else(|| "/".to_string());
    // Only app-relative paths — never remote URLs — may load in a window.
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(format!("Invalid window path: {path}"));
    }

    let mut n: u32 = 2;
    while app.get_webview_window(&format!("terminal-{n}")).is_some() {
        n += 1;
    }
    let label = format!("terminal-{n}");

    // Inject the runtime CSP (baseline + consented plugin host grants) into this
    // window's served document, same as the main window.
    let csp_handle = app.clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(path.into()))
        .title("Pairlens")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .on_web_resource_request(move |_req, resp| csp::inject_csp(&csp_handle, resp))
        // Hidden until the frontend signals readiness via close_splashscreen,
        // matching the main window's boot sequence (prevents white flash).
        .visible(false)
        .background_color(WINDOW_BG);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    let new_window = builder.build().map_err(|e| e.to_string())?;
    spawn_show_watchdog(new_window.clone());

    // Cascade from the window that spawned us so new windows don't stack
    // exactly on top of each other.
    if let (Ok(pos), Ok(scale)) = (window.outer_position(), window.scale_factor()) {
        let offset = (32.0 * scale) as i32;
        let _ =
            new_window.set_position(tauri::PhysicalPosition::new(pos.x + offset, pos.y + offset));
    }

    Ok(label)
}

// ── OS keychain credential storage ──────────────────────────────────
//
// Exchange API keys and wallet secrets are stored in the OS keychain
// (macOS Keychain / Windows Credential Manager / Linux Secret Service)
// via the `keyring` crate. The frontend calls these commands through
// `apps/terminal/src/lib/keychain.ts`. Keychain access can block (Secret
// Service goes over D-Bus, macOS may consult security policy), so every
// command hops to a blocking thread.

const KEYCHAIN_SERVICE: &str = "finance.pairlens.desktop";

fn keychain_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn keychain_set(key: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        keychain_entry(&key)?
            .set_password(&value)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn keychain_get(key: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match keychain_entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn keychain_delete(key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match keychain_entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Local plugins directory ─────────────────────────────────────────
//
// Plugins live under `<app-data>/plugins/<id>/` as a folder containing
// `manifest.json` + `module.js` (+ optional `styles.css`). Zip extraction and
// manifest validation happen in the frontend (reusing @pairlens/shared); these
// commands are intentionally just scoped filesystem I/O.

#[derive(Serialize)]
struct LocalPlugin {
    id: String,
    /// Raw manifest.json text.
    manifest: String,
    /// module.js source (single-file ESM).
    module_text: String,
    /// Optional styles.css source.
    style_text: Option<String>,
}

/// Resolve (and create) the plugins directory under the app data dir.
fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Plugin ids are `[a-z0-9-]` (2-64 chars) — reject anything that could escape
/// the plugins directory via path traversal.
fn sanitize_id(id: &str) -> Result<String, String> {
    let ok = (2..=64).contains(&id.len())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !ok {
        return Err(format!("Invalid plugin id: {id}"));
    }
    Ok(id.to_string())
}

/// List plugin folder ids that contain a valid layout (manifest.json + module.js).
#[tauri::command]
fn list_plugin_dirs(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = plugins_dir(&app)?;
    let mut ids = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path.join("manifest.json").exists()
                && path.join("module.js").exists()
            {
                if let Some(name) = entry.file_name().to_str() {
                    if sanitize_id(name).is_ok() {
                        ids.push(name.to_string());
                    }
                }
            }
        }
    }
    Ok(ids)
}

/// Read a plugin's files from `<app-data>/plugins/<id>/`.
#[tauri::command]
fn read_plugin(app: AppHandle, id: String) -> Result<Option<LocalPlugin>, String> {
    let dir = plugins_dir(&app)?.join(sanitize_id(&id)?);
    let manifest_path = dir.join("manifest.json");
    let module_path = dir.join("module.js");
    if !manifest_path.exists() || !module_path.exists() {
        return Ok(None);
    }
    let manifest = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let module_text = fs::read_to_string(&module_path).map_err(|e| e.to_string())?;
    let style_path = dir.join("styles.css");
    let style_text = if style_path.exists() {
        Some(fs::read_to_string(&style_path).map_err(|e| e.to_string())?)
    } else {
        None
    };
    Ok(Some(LocalPlugin {
        id,
        manifest,
        module_text,
        style_text,
    }))
}

/// Write a plugin folder (used by Import / drag-drop after the frontend has
/// unzipped + validated the package).
#[tauri::command]
fn write_plugin(
    app: AppHandle,
    id: String,
    manifest: String,
    module_text: String,
    style_text: Option<String>,
) -> Result<(), String> {
    let dir = plugins_dir(&app)?.join(sanitize_id(&id)?);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("manifest.json"), manifest).map_err(|e| e.to_string())?;
    fs::write(dir.join("module.js"), module_text).map_err(|e| e.to_string())?;
    let style_path = dir.join("styles.css");
    match style_text {
        Some(css) => fs::write(&style_path, css).map_err(|e| e.to_string())?,
        None => {
            let _ = fs::remove_file(&style_path);
        }
    }
    Ok(())
}

/// Delete a plugin folder (uninstall).
#[tauri::command]
fn delete_plugin(app: AppHandle, id: String) -> Result<(), String> {
    let dir = plugins_dir(&app)?.join(sanitize_id(&id)?);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open the plugins directory in the OS file manager (for manual drop-in).
#[tauri::command]
fn open_plugins_dir(app: AppHandle) -> Result<(), String> {
    let dir = plugins_dir(&app)?;
    open_path(&dir)
}

// ── File exports ────────────────────────────────────────────────────
//
// The webview is built without a download handler, so wry cancels every
// `<a download>` navigation — in the desktop app a browser-style download
// silently does nothing. Exports (indicator plugin zips, chart screenshots)
// therefore write through Rust, and the frontend reports the real path back
// to the user.

/// Reject anything that isn't a bare file name — no separators, no `..`.
fn sanitize_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    let is_bare = !trimmed.is_empty()
        && trimmed.len() <= 255
        && Path::new(trimmed).file_name().and_then(|n| n.to_str()) == Some(trimmed);
    if !is_bare {
        return Err(format!("Invalid file name: {name}"));
    }
    Ok(trimmed.to_string())
}

/// Pick a non-colliding path in `dir`, appending ` (1)`, ` (2)`, … before the
/// extension — the same convention the OS download managers use.
fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let mut path = dir.join(file_name);
    if !path.exists() {
        return path;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, format!(".{ext}")),
        _ => (file_name, String::new()),
    };
    let mut counter = 1;
    while path.exists() {
        path = dir.join(format!("{stem} ({counter}){ext}"));
        counter += 1;
    }
    path
}

/// Write exported bytes into the user's Downloads folder, returning the
/// absolute path so the UI can show it (and offer "Show in folder").
#[tauri::command]
async fn save_to_downloads(
    app: AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let name = sanitize_file_name(&file_name)?;
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("No Downloads folder available: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = unique_path(&dir, &name);
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Reveal a saved file in the OS file manager — selected, never opened, so
/// revealing can't execute anything.
#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("File no longer exists: {path}"));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    // No portable "select the file" on Linux — open the containing folder.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = target.parent().unwrap_or(&target);
        open_path(dir)?;
    }
    Ok(())
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";

    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registered first (per plugin docs): a second app launch focuses the
        // existing main window instead of starting a duplicate instance —
        // duplicates would double WS connections and notifications.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_shell::init())
        // Rust-side fetch for connector REST — bypasses the webview's CORS
        // enforcement, which blocks market history from exchanges that send no
        // Access-Control-Allow-Origin. Confined by the URL scope in
        // capabilities/default.json; the sandbox worker has no Tauri IPC, so
        // sandboxed plugins cannot reach it and stay bound by the CSP.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Remember window size/position across launches (saved to
        // .window-state.json in the app config dir on exit, restored when a
        // window with the same label is created). VISIBLE is excluded because
        // visibility is owned by the splash flow — windows start hidden and
        // are shown by close_splashscreen.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .with_denylist(&["splashscreen"])
                .build(),
        )
        // Holds the idle-sleep assertion while trading bots are armed.
        .manage(awake::AwakeState::default())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            open_terminal_window,
            keychain_set,
            keychain_get,
            keychain_delete,
            list_plugin_dirs,
            read_plugin,
            write_plugin,
            delete_plugin,
            open_plugins_dir,
            save_to_downloads,
            reveal_in_file_manager,
            csp::network_grants_get,
            csp::network_grant_set,
            csp::network_grant_revoke,
            csp::network_baseline_hosts,
            awake::sleep_block_set,
            awake::sleep_block_active
        ])
        .setup(|app| {
            // The main window is built here (not in tauri.conf.json) so the
            // dynamic-CSP hook can attach to its served document — a config-defined
            // window offers no way to intercept its response headers.
            let csp_handle = app.handle().clone();
            #[allow(unused_mut)]
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
                .title("Pairlens")
                .inner_size(1440.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .resizable(true)
                .center()
                .on_web_resource_request(move |_req, resp| csp::inject_csp(&csp_handle, resp))
                // Hidden until the frontend signals readiness via
                // close_splashscreen (prevents white flash on boot).
                .visible(false)
                .background_color(WINDOW_BG);
            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }
            let window = builder.build()?;
            spawn_show_watchdog(window.clone());

            // First launch only: default the main window to ~80% of the
            // screen, centered. On later launches tauri-plugin-window-state
            // has already restored the user's last size/position during
            // window creation — resizing here would clobber it.
            let has_saved_state = app
                .path()
                .app_config_dir()
                .map(|dir| {
                    dir.join(tauri_plugin_window_state::DEFAULT_FILENAME)
                        .exists()
                })
                .unwrap_or(false);
            if !has_saved_state {
                if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let screen = monitor.size();
                    let scale = monitor.scale_factor();
                    let sw = screen.width as f64 / scale;
                    let sh = screen.height as f64 / scale;
                    let w = sw * 0.80;
                    let h = sh * 0.80;
                    let x = (sw - w) / 2.0;
                    let y = (sh - h) / 2.0;
                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                    let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                }
            }

            // Show splash after a brief delay so the webview has time to
            // initialize with the black backgroundColor — prevents white flash.
            if let Some(splash) = app.get_webview_window("splashscreen") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    let _ = splash.show();
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running pairlens desktop")
}

#[cfg(test)]
mod tests {
    use super::{sanitize_file_name, unique_path};

    #[test]
    fn accepts_plain_file_names_and_rejects_paths() {
        assert_eq!(
            sanitize_file_name("my-indicator.zip").unwrap(),
            "my-indicator.zip"
        );
        assert_eq!(sanitize_file_name("  chart.png  ").unwrap(), "chart.png");
        assert!(sanitize_file_name("").is_err());
        assert!(sanitize_file_name("..").is_err());
        assert!(sanitize_file_name("../../etc/passwd").is_err());
        assert!(sanitize_file_name("nested/name.zip").is_err());
    }

    #[test]
    fn dedupes_against_existing_files() {
        let dir = std::env::temp_dir().join("pairlens-save-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        assert_eq!(unique_path(&dir, "sma.zip"), dir.join("sma.zip"));

        std::fs::write(dir.join("sma.zip"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "sma.zip"), dir.join("sma (1).zip"));

        std::fs::write(dir.join("sma (1).zip"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "sma.zip"), dir.join("sma (2).zip"));

        // Extension-less names still get a counter.
        std::fs::write(dir.join("notes"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "notes"), dir.join("notes (1)"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
