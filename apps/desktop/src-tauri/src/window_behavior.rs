// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//! What happens when the user closes the last window.
//!
//! Everything the terminal keeps running in the background — armed bots, alert
//! rules, workflow `wait` steps that still owe a stop-loss — lives inside the
//! webview. Destroying the last window destroys all of it, mid-position and
//! without a word. So "close" has to be a choice:
//!
//! - `Quit` — closing the last window quits the app. Honest and final.
//! - `Background` — the window hides, the process (and everything it is
//!   running) stays alive. The Dock icon on macOS, a tray icon on
//!   Windows/Linux, brings it back.
//!
//! The setting is owned by Rust rather than the frontend for two reasons: it
//! must be readable from inside a window-event callback (no webview round-trip
//! available there), and it must already be correct before the first window
//! exists. It is also deliberately device-local — which behavior a *machine*
//! should have is not a fact about the user's account, and a Mac's default has
//! no business governing a Windows box.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, CloseRequestApi, Emitter, EventTarget, Manager, Window};

/// Preference file, written next to `.window-state.json` in the app config dir.
const PREFS_FILE: &str = "desktop-prefs.json";

/// The splash window is never a "terminal window" for any of the counting below.
const SPLASH_LABEL: &str = "splashscreen";

/// Emitted to the webview when its window is hidden (`true`) or shown again
/// (`false`). A hidden window has, by construction, no user activity and no
/// visible UI — consumers use this to stop pretending otherwise (the idle
/// guard, the updater's restart prompt).
pub const WINDOW_HIDDEN_EVENT: &str = "pairlens://window-hidden";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    /// Closing the last window quits the app.
    Quit,
    /// Closing the last window hides it; the app keeps running.
    Background,
}

impl CloseBehavior {
    fn as_u8(self) -> u8 {
        match self {
            Self::Quit => 0,
            Self::Background => 1,
        }
    }

    /// Anything that isn't a stored discriminant — including the
    /// "never loaded" sentinel — resolves to the platform default.
    fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Quit,
            1 => Self::Background,
            _ => platform_default(),
        }
    }
}

/// `BEHAVIOR` before `load()` has run.
const NOT_LOADED: u8 = u8::MAX;

/// Read on the event-loop thread from the close callback, written from IPC
/// threads — an atomic keeps that lock-free rather than putting a mutex on a
/// path that runs while a window is closing.
static BEHAVIOR: AtomicU8 = AtomicU8::new(NOT_LOADED);

/// Set the moment a deliberate quit starts, and checked first in the close
/// handler: an explicit Quit must never be turned into a hide.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// macOS and Windows default to staying alive (the Dock icon and the tray are
/// both well-understood affordances, and on macOS the app already outlived its
/// last window — it just threw the webview away). Linux defaults to quitting:
/// a tray there needs a StatusNotifierItem host, and GNOME ships none without
/// the AppIndicator extension, so background mode risks hiding the app
/// somewhere the user cannot reach it.
pub fn platform_default() -> CloseBehavior {
    if cfg!(target_os = "linux") {
        CloseBehavior::Quit
    } else {
        CloseBehavior::Background
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPrefs {
    #[serde(skip_serializing_if = "Option::is_none")]
    close_behavior: Option<CloseBehavior>,
}

/// What the frontend needs to render the setting honestly: what is in force,
/// whether a tray affordance is required on this OS, and whether one exists.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseBehaviorInfo {
    behavior: CloseBehavior,
    /// macOS: always true (the Dock icon is the affordance). Elsewhere: whether
    /// a tray icon was actually created.
    tray_available: bool,
    /// Whether background mode needs a tray icon at all on this OS.
    tray_required: bool,
}

fn prefs_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(PREFS_FILE))
}

/// Load the persisted behavior into the atomic. Called first thing in `setup`,
/// before any window exists, so the value governs from the first frame. A
/// missing or corrupt file is not an error path — it is a fresh install.
pub fn load(app: &AppHandle) {
    let behavior = prefs_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<DesktopPrefs>(&text).ok())
        .and_then(|prefs| prefs.close_behavior)
        .unwrap_or_else(platform_default);
    BEHAVIOR.store(behavior.as_u8(), Ordering::Release);
}

pub fn current() -> CloseBehavior {
    CloseBehavior::from_u8(BEHAVIOR.load(Ordering::Acquire))
}

fn persist(app: &AppHandle, behavior: CloseBehavior) -> Result<(), String> {
    let path = prefs_path(app).ok_or("no app config dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&DesktopPrefs {
        close_behavior: Some(behavior),
    })
    .map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn info(app: &AppHandle) -> CloseBehaviorInfo {
    CloseBehaviorInfo {
        behavior: current(),
        tray_available: crate::tray::is_available(app),
        tray_required: !cfg!(target_os = "macos"),
    }
}

/// Labels this module hid into the background.
///
/// `is_visible()` cannot stand in for "the user can see this window". On macOS
/// it maps to `NSWindow.isVisible`, which is **false for a miniaturized
/// window**, and every window here is created with `.visible(false)` and only
/// shown once the frontend calls `close_splashscreen`. Either case would read
/// as "not on screen", so closing a sibling would take the last-window branch
/// and hide it — and a hidden `terminal-2` is unreachable (macOS has no tray
/// and the dock click always raises `main`) while its webview keeps streaming,
/// trading and holding the window-leader lock. Tracking the hides we performed
/// ourselves is the only signal that means exactly what this needs.
static HIDDEN: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

fn with_hidden<T>(f: impl FnOnce(&mut BTreeSet<String>) -> T) -> T {
    let mut guard = HIDDEN
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    f(&mut guard)
}

fn mark_hidden(label: &str) {
    with_hidden(|set| set.insert(label.to_string()));
}

/// This window is on screen again (shown from the tray/Dock, or destroyed).
pub fn mark_visible(label: &str) {
    with_hidden(|set| set.remove(label));
}

fn is_hidden(label: &str) -> bool {
    with_hidden(|set| set.contains(label))
}

/// How many terminal windows the user can currently see. Windows hidden into
/// the background are excluded on purpose: in background mode the
/// previously-hidden window is still alive in the manager, and "the last
/// window" means the last one on screen, not the last one in memory. Counts
/// windows rather than webviews so the child webviews the in-app web pane
/// creates never register.
fn visible_window_count(app: &AppHandle) -> usize {
    app.windows()
        .keys()
        .filter(|label| label.as_str() != SPLASH_LABEL && !is_hidden(label.as_str()))
        .count()
}

/// Terminal windows other than `label`, hidden ones included.
fn other_window_count(app: &AppHandle, label: &str) -> usize {
    app.windows()
        .keys()
        .filter(|l| l.as_str() != SPLASH_LABEL && l.as_str() != label)
        .count()
}

/// Intercept a window close in background mode: hide the last visible window
/// instead of destroying it, so everything running inside it keeps running.
pub fn handle_close_requested(window: &Window, api: &CloseRequestApi) {
    if window.label() == SPLASH_LABEL {
        return;
    }
    // A deliberate quit (tray → Quit, Ctrl+Q, the settings button) always wins.
    if QUITTING.load(Ordering::Acquire) {
        return;
    }
    if current() != CloseBehavior::Background {
        return;
    }

    let app = window.app_handle();
    // Not the last one on screen: destroy it normally. Window leadership hands
    // off to a sibling and the runtimes restart there.
    if visible_window_count(app) > 1 {
        return;
    }

    // Windows/Linux have no Dock icon: a tray item is the ONLY way back to a
    // hidden window. Build it BEFORE the close is prevented — a persisted
    // `background` restored by `load()` never went through the refusal in
    // `close_behavior_set`, so this is the only place that check exists for it
    // (KDE session enables background, next login is GNOME without the
    // AppIndicator extension). Failing to build one means hiding would leave a
    // running process with no window, no tray and no way in, so fall back to a
    // normal close and record the downgrade.
    #[cfg(not(target_os = "macos"))]
    {
        if !crate::tray::ensure(app) {
            downgrade_to_quit(app);
            return;
        }
    }

    api.prevent_close();

    // Hiding a fullscreen window leaves the user staring at an empty Space, so
    // leave fullscreen first. The transition is animated, so the hide has to
    // wait for it — the close is already prevented, nothing is racing us.
    #[cfg(target_os = "macos")]
    {
        if window.is_fullscreen().unwrap_or(false) {
            let _ = window.set_fullscreen(false);
            let deferred = window.clone();
            // Observed, not timed: the AppKit exit animation's duration varies
            // with machine and load, and a fixed sleep that lands mid-transition
            // hides nothing (or hides into an empty Space). Bounded so a stuck
            // transition can never pin the hide forever.
            std::thread::spawn(move || {
                for _ in 0..60 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if !deferred.is_fullscreen().unwrap_or(false) {
                        break;
                    }
                }
                // A second red-button click during the transition took the
                // non-fullscreen branch and already hid it — don't hide twice.
                if !is_hidden(deferred.label()) {
                    hide_into_background(&deferred);
                }
            });
            return;
        }
    }

    hide_into_background(window);
}

fn hide_into_background(window: &Window) {
    mark_hidden(window.label());
    let _ = window.hide();
    // Addressed to THIS window, never broadcast: `emit` reaches every webview,
    // and a sibling still on screen would then disable its idle guard and defer
    // its "Restart & update" prompt as if it were hidden too — with nothing to
    // ever clear the flag.
    let _ = window.emit_to(
        EventTarget::webview_window(window.label()),
        WINDOW_HIDDEN_EVENT,
        true,
    );
}

/// A window was destroyed. When it was the last one, release the idle-sleep
/// assertion: the bot runtime that asked for it died with the webview, and
/// nothing on the JS side is left to release it — the assertion would otherwise
/// be held for the life of the process, keeping the machine awake for bots that
/// no longer exist.
pub fn handle_destroyed(window: &Window) {
    if window.label() == SPLASH_LABEL {
        return;
    }
    // Labels are reused (`terminal-2` is handed out again once it is free), so
    // a stale "hidden" entry would make a brand-new window invisible to the
    // count.
    mark_visible(window.label());
    let app = window.app_handle();
    if other_window_count(app, window.label()) == 0 {
        crate::awake::release(app);
    }
}

// ── Commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn close_behavior_get(app: AppHandle) -> CloseBehaviorInfo {
    info(&app)
}

/// Persist a new behavior and report back what was **actually** applied.
///
/// Asking for background on a desktop with no usable tray is refused rather
/// than honored: hiding the app into a place the user cannot reach is worse
/// than saying plainly that it can't be done here.
#[tauri::command]
pub fn close_behavior_set(
    app: AppHandle,
    behavior: CloseBehavior,
) -> Result<CloseBehaviorInfo, String> {
    // Whether background is even possible can only be answered by trying to
    // build the tray, so that one probe has to come first.
    let had_tray = crate::tray::is_available(&app);
    let mut applied = behavior;
    if behavior == CloseBehavior::Background && !crate::tray::ensure(&app) {
        applied = CloseBehavior::Quit;
    }

    // Commit before changing anything the user can see. A read-only or full
    // config dir used to leave the tray already torn down (or already built)
    // while the in-memory behavior still said otherwise — a tray promising a
    // background mode that is not in force, or a hide into a tray that was just
    // deleted.
    if let Err(e) = persist(&app, applied) {
        if !had_tray {
            crate::tray::remove(&app);
        }
        return Err(e);
    }
    BEHAVIOR.store(applied.as_u8(), Ordering::Release);
    if applied != CloseBehavior::Background {
        crate::tray::remove(&app);
    }
    Ok(info(&app))
}

/// Record a fall back to `Quit`.
///
/// Background mode with no way back is not a mode: when the tray cannot be
/// created, the setting the user sees must say what the app will actually do.
pub fn downgrade_to_quit(app: &AppHandle) {
    BEHAVIOR.store(CloseBehavior::Quit.as_u8(), Ordering::Release);
    let _ = persist(app, CloseBehavior::Quit);
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    request_quit(&app);
}

/// The one way out. Every explicit quit path routes through here so the close
/// handler can tell "the user asked to quit" from "the user closed a window".
pub fn request_quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::Release);
    app.exit(0);
}

/// Whether a deliberate quit is in progress. Read by the run-loop handler so a
/// requested exit is never prevented.
pub fn is_quitting() -> bool {
    QUITTING.load(Ordering::Acquire)
}

#[cfg(test)]
mod tests {
    use super::{platform_default, CloseBehavior, DesktopPrefs, NOT_LOADED};

    #[test]
    fn serializes_to_the_wire_values_the_frontend_uses() {
        assert_eq!(
            serde_json::to_string(&CloseBehavior::Background).unwrap(),
            "\"background\""
        );
        assert_eq!(
            serde_json::to_string(&CloseBehavior::Quit).unwrap(),
            "\"quit\""
        );
        assert_eq!(
            serde_json::from_str::<CloseBehavior>("\"background\"").unwrap(),
            CloseBehavior::Background
        );
        assert!(serde_json::from_str::<CloseBehavior>("\"hide\"").is_err());
    }

    #[test]
    fn prefs_file_uses_camel_case_and_tolerates_a_missing_key() {
        let text = serde_json::to_string(&DesktopPrefs {
            close_behavior: Some(CloseBehavior::Background),
        })
        .unwrap();
        assert_eq!(text, r#"{"closeBehavior":"background"}"#);

        let empty: DesktopPrefs = serde_json::from_str("{}").unwrap();
        assert_eq!(empty.close_behavior, None);
    }

    #[test]
    fn corrupt_prefs_never_parse_into_a_behavior() {
        assert!(serde_json::from_str::<DesktopPrefs>("not json").is_err());
        // A wrong-typed value is a parse error too — the caller falls back to
        // the platform default rather than guessing.
        assert!(serde_json::from_str::<DesktopPrefs>(r#"{"closeBehavior":3}"#).is_err());
    }

    #[test]
    fn platform_default_matches_the_documented_policy() {
        let expected = if cfg!(target_os = "linux") {
            CloseBehavior::Quit
        } else {
            CloseBehavior::Background
        };
        assert_eq!(platform_default(), expected);
    }

    #[test]
    fn unloaded_sentinel_falls_back_to_the_platform_default() {
        assert_eq!(CloseBehavior::from_u8(NOT_LOADED), platform_default());
        assert_eq!(CloseBehavior::from_u8(9), platform_default());
        assert_eq!(CloseBehavior::from_u8(0), CloseBehavior::Quit);
        assert_eq!(CloseBehavior::from_u8(1), CloseBehavior::Background);
        assert_eq!(CloseBehavior::Quit.as_u8(), 0);
        assert_eq!(CloseBehavior::Background.as_u8(), 1);
    }
}
