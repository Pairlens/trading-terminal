// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

mod awake;
mod csp;
mod tray;
mod window_behavior;

/// Window background while the webview has unpainted regions — matches the
/// app's dark `--background` token (oklch(13.5% 0.006 74) ≈ rgb(10, 8, 6)) so
/// early frames never flash white.
const WINDOW_BG: tauri::window::Color = tauri::window::Color(10, 8, 6, 255);

/// Extra WebView2 command-line switches (Windows only).
///
/// Chromium throttles timers in hidden pages, and after a few minutes escalates
/// to "intensive" throttling that coalesces them to roughly once a minute. In
/// background mode the window is hidden by design and the bot runtime, the
/// alert scheduler and the sync coordinator all still have work to do, so the
/// throttles have to come off.
///
/// The `--disable-features=` group is **Tauri's own default** and is repeated
/// deliberately: setting `additional_browser_args` replaces the defaults rather
/// than appending to them, so omitting it would silently turn those back on.
#[cfg(target_os = "windows")]
const WEBVIEW2_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

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
///
/// `slow_boot` is for the main window, which boots the whole app behind a splash
/// screen the user can see. A secondary window has no splash to look at, so it
/// waits far less before showing itself: an empty dark window beats nothing at
/// all happening after a New Window click.
fn spawn_show_watchdog(window: WebviewWindow, slow_boot: bool) {
    // Dev builds load from the Vite dev server, whose cold compile can take
    // far longer than a production boot.
    let timeout = match (slow_boot, cfg!(debug_assertions)) {
        (true, true) => 60,
        (true, false) => 15,
        (false, true) => 20,
        (false, false) => 5,
    };
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

/// Build the app's main window.
///
/// Extracted from `setup` so every path that needs a main window — first launch,
/// the macOS dock-reopen, a second app launch caught by single-instance — builds
/// it identically. Most importantly they all keep the `on_web_resource_request`
/// hook that injects the runtime CSP; a window rebuilt without it would run the
/// SPA with no network policy at all.
fn build_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let csp_handle = app.clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
        .title("Pairlens")
        .inner_size(1440.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .center()
        .on_web_resource_request(move |_req, resp| csp::inject_csp(&csp_handle, resp))
        // Hidden until the frontend signals readiness via close_splashscreen
        // (prevents white flash on boot).
        .visible(false)
        .background_color(WINDOW_BG);
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }
    #[cfg(target_os = "windows")]
    {
        builder = builder.additional_browser_args(WEBVIEW2_ARGS);
    }
    let window = builder.build()?;
    spawn_show_watchdog(window.clone(), true);
    Ok(window)
}

/// The terminal window a "show me the app" gesture should land on: the main
/// window when it exists, otherwise the lowest-numbered secondary window.
///
/// Looking only for the label `"main"` was fine while a closed window meant a
/// destroyed window. Background mode makes hidden windows normal, and with it
/// the case where `main` is gone but `terminal-2` is merely hidden — a
/// main-only lookup would build a *second* main window and orphan the hidden
/// one, which the user has no way left to reach.
fn front_terminal_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(window) = app.get_webview_window("main") {
        return Some(window);
    }
    let mut labels: Vec<String> = app
        .webview_windows()
        .into_keys()
        .filter(|label| label.starts_with("terminal-"))
        .collect();
    // Numeric, not lexicographic: `terminal-10` must not sort before `terminal-2`.
    labels.sort_by_key(|label| {
        label
            .trim_start_matches("terminal-")
            .parse::<u32>()
            .unwrap_or(u32::MAX)
    });
    labels
        .first()
        .and_then(|label| app.get_webview_window(label))
}

/// Bring a terminal window to the front — showing it when background mode hid
/// it, and rebuilding one only when none is left at all (macOS keeps the app
/// alive after its last window closes — see the run-loop handler at the bottom
/// of this file).
///
/// The work runs on a spawned thread, never the caller's. Every call site (the
/// single-instance handler, the macOS dock-reopen event, the tray) fires from
/// inside the event loop on the main thread, and building a webview from there
/// deadlocks on Windows — the same WebView2 constraint that broke "New Window".
fn focus_main_window(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(window) = front_terminal_window(&app) {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            window_behavior::mark_visible(window.label());
            // Tell the webview it is on screen again: it may have paused work
            // (idle guard, deferred update prompt) while it was hidden.
            // Addressed to this window only — a broadcast would tell every
            // other window it is visible too.
            let _ = window.emit_to(
                tauri::EventTarget::webview_window(window.label()),
                window_behavior::WINDOW_HIDDEN_EVENT,
                false,
            );
            return;
        }
        if let Err(e) = build_main_window(&app) {
            eprintln!("[pairlens] failed to recreate the main window: {e}");
        }
    });
}

// ── Multi-window ────────────────────────────────────────────────────
//
// Additional terminal windows carry labels `terminal-2`, `terminal-3`, …
// (the first window keeps the label `main`). The capability file allowlists
// `terminal-*` so secondary windows get the same permission set as the main
// window. Each window loads the same SPA; the frontend passes a path (e.g. a
// workspace route) so the new window opens on the content the user asked for.

static WINDOW_SPAWN_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Spawn a new terminal window. Returns the new window's label.
///
/// `async` on purpose, and load-bearing on Windows: Tauri runs *synchronous*
/// commands on the main thread, inside the webview's own IPC callback. Creating
/// a webview from there deadlocks WebView2 (it cannot initialize a new
/// controller while the message loop is servicing the callback that asked for
/// it), which is exactly why New Window opened nothing on Windows. An async
/// command runs on the async runtime instead, so window creation is dispatched
/// to the event loop and handled on a clean stack. macOS/Linux are unaffected
/// either way — Tauri marshals the actual window construction to the main thread
/// itself, so this needs no platform branch.
#[tauri::command]
async fn open_terminal_window(
    app: AppHandle,
    window: WebviewWindow,
    path: Option<String>,
) -> Result<String, String> {
    let path = path.unwrap_or_else(|| "/".to_string());
    // Only app-relative paths — never remote URLs — may load in a window.
    if !path.starts_with('/') || path.starts_with("//") {
        return Err(format!("Invalid window path: {path}"));
    }

    // Serializes label allocation. Now that this command runs on the async
    // runtime, two New Window invocations can execute concurrently on different
    // threads and would otherwise both claim the same free label — the second
    // build then fails with "window label already exists". Held across the build
    // (which is where the label gets registered); no await runs under it.
    let _spawn_guard = WINDOW_SPAWN_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

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
    #[cfg(target_os = "windows")]
    {
        builder = builder.additional_browser_args(WEBVIEW2_ARGS);
    }

    // Surface build failures on both sides of the IPC: the frontend toasts the
    // returned message, and stderr keeps a record for a packaged build whose
    // devtools nobody has open.
    let new_window = builder.build().map_err(|e| {
        let message = e.to_string();
        eprintln!("[pairlens] failed to open window {label}: {message}");
        message
    })?;
    spawn_show_watchdog(new_window.clone(), false);

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
            // Rebuilds the main window when it is gone — on macOS the app
            // outlives its last window, so "focus the existing window" is not
            // always something that can be done by focusing alone.
            focus_main_window(app);
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
        // Native OS notifications — WKWebView has no Notification API, so this
        // is the only delivery path on macOS, and the only one a hidden
        // (background-mode) window has anywhere.
        .plugin(tauri_plugin_notification::init())
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
        // "When the last window closes": hide it and keep running, or let the
        // close go through and quit. Registered as a global window-event
        // handler so it covers every window, including ones opened later.
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window_behavior::handle_close_requested(window, api)
            }
            tauri::WindowEvent::Destroyed => window_behavior::handle_destroyed(window),
            _ => {}
        })
        // Holds the idle-sleep assertion while trading bots are armed.
        .manage(awake::AwakeState::default())
        // Tray icon (Windows/Linux) — the way back to a hidden window.
        .manage(tray::TrayState::default())
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
            awake::sleep_block_active,
            window_behavior::close_behavior_get,
            window_behavior::close_behavior_set,
            window_behavior::app_quit,
            tray::tray_set_labels
        ])
        .setup(|app| {
            // Before the first window exists: the close behavior has to be in
            // force from the very first frame, and it is read from a window
            // callback that has no way to ask the frontend.
            window_behavior::load(app.handle());

            // The main window is built in Rust (not in tauri.conf.json) so the
            // dynamic-CSP hook can attach to its served document — a config-defined
            // window offers no way to intercept its response headers.
            let window = build_main_window(app.handle())?;

            // Windows/Linux: the tray must already exist when the user closes
            // their last window, not be created in the same breath as the hide.
            // A persisted `background` can outlive the desktop that could show
            // one (a KDE session's setting restored under GNOME with no
            // AppIndicator extension), so a failure here is not something to
            // shrug at: record the fall back to quit so the setting the user
            // reads matches what closing the window will do.
            if window_behavior::current() == window_behavior::CloseBehavior::Background
                && !tray::ensure(app.handle())
            {
                window_behavior::downgrade_to_quit(app.handle());
            }

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
        .build(tauri::generate_context!())
        .expect("error while running pairlens desktop")
        .run(|_app, _event| {
            // macOS: in background mode, closing the last window must not quit
            // the app. It stays in the Dock and clicking its icon brings the
            // window back — standard Mac behaviour, and the one users expect
            // from a terminal they leave running all day.
            //
            // `code` distinguishes the two exit paths: `None` means the event
            // loop is unwinding because its last window was destroyed, `Some`
            // means something asked for it deliberately (`app.exit()`, the
            // updater's restart). Cmd+Q goes through AppKit's `terminate:`,
            // which tears the process down without an ExitRequested round-trip
            // at all, so quitting keeps working.
            //
            // Preventing the exit here is belt-and-braces for background mode:
            // the close handler normally hides the window rather than letting
            // it be destroyed, but `window.destroy()` from JS or a webview
            // crash can still take the last window down without a
            // CloseRequested. In quit mode we let the exit through — that is
            // exactly what the user asked for.
            #[cfg(target_os = "macos")]
            match &_event {
                tauri::RunEvent::ExitRequested { code, api, .. }
                    if code.is_none()
                        && !window_behavior::is_quitting()
                        && window_behavior::current()
                            == window_behavior::CloseBehavior::Background =>
                {
                    api.prevent_exit();
                }
                // Dock icon click (NSApplicationDelegate applicationShouldHandleReopen).
                tauri::RunEvent::Reopen { .. } => focus_main_window(_app),
                _ => {}
            }
        })
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
