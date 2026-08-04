// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//! System-tray affordance for background mode — Windows and Linux only.
//!
//! macOS deliberately gets no tray item: the Dock icon already *is* the
//! affordance, clicking it is universally understood, and a second icon in the
//! menu bar would be clutter that says nothing new. Everything here is
//! therefore a no-op on macOS, and `is_available` reports `true` there because
//! the way back into the app never depended on a tray in the first place.
//!
//! On Windows/Linux the tray is the only way back to a hidden window, so it is
//! created *before* the first hide and its creation failing is treated as a
//! reason to refuse background mode rather than something to shrug at.

use tauri::AppHandle;

#[cfg(not(target_os = "macos"))]
mod imp {
    use std::sync::Mutex;

    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
    use tauri::{AppHandle, Manager, Wry};

    const TRAY_ID: &str = "pairlens-tray";
    const SHOW_ID: &str = "pairlens-tray-show";
    const QUIT_ID: &str = "pairlens-tray-quit";

    /// English fallbacks. Rust cannot know the UI language before the webview
    /// boots, so the tray is built in English and re-labelled by the frontend
    /// through `tray_set_labels` once i18n is ready (and on every language
    /// change).
    const DEFAULT_SHOW: &str = "Show Pairlens";
    const DEFAULT_QUIT: &str = "Quit Pairlens";

    /// The live icon plus the menu items, which have to be retained so their
    /// text can be changed later.
    pub struct TrayState {
        icon: Mutex<Option<TrayIcon>>,
        items: Mutex<Option<(MenuItem<Wry>, MenuItem<Wry>)>>,
        labels: Mutex<(String, String)>,
    }

    impl Default for TrayState {
        fn default() -> Self {
            Self {
                icon: Mutex::new(None),
                items: Mutex::new(None),
                labels: Mutex::new((DEFAULT_SHOW.to_string(), DEFAULT_QUIT.to_string())),
            }
        }
    }

    /// Create the tray icon if it isn't there yet. Idempotent; returns whether
    /// a tray icon exists afterwards.
    pub fn ensure(app: &AppHandle) -> bool {
        let Some(state) = app.try_state::<TrayState>() else {
            return false;
        };
        {
            let guard = match state.icon.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            if guard.is_some() {
                return true;
            }
        }

        let (show_label, quit_label) = match state.labels.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        };

        match build(app, &show_label, &quit_label) {
            Ok((icon, show, quit)) => {
                if let Ok(mut guard) = state.icon.lock() {
                    *guard = Some(icon);
                }
                if let Ok(mut guard) = state.items.lock() {
                    *guard = Some((show, quit));
                }
                true
            }
            Err(e) => {
                eprintln!("[pairlens] could not create the tray icon: {e}");
                false
            }
        }
    }

    fn build(
        app: &AppHandle,
        show_label: &str,
        quit_label: &str,
    ) -> tauri::Result<(TrayIcon, MenuItem<Wry>, MenuItem<Wry>)> {
        let show = MenuItem::with_id(app, SHOW_ID, show_label, true, None::<&str>)?;
        let quit = MenuItem::with_id(app, QUIT_ID, quit_label, true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

        let mut builder = TrayIconBuilder::<Wry>::with_id(TRAY_ID)
            .menu(&menu)
            .tooltip("Pairlens — running in the background")
            .on_menu_event(|app, event| match event.id.as_ref() {
                SHOW_ID => crate::focus_main_window(app),
                QUIT_ID => crate::window_behavior::request_quit(app),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    crate::focus_main_window(tray.app_handle());
                }
            });

        if let Some(icon) = app.default_window_icon().cloned() {
            builder = builder.icon(icon);
        }

        // Windows convention: left-click restores the window, right-click opens
        // the menu. On Linux the menu is the only interaction StatusNotifierItem
        // delivers reliably, which is why "Show Pairlens" is a menu item at all.
        #[cfg(target_os = "windows")]
        {
            builder = builder.show_menu_on_left_click(false);
        }

        let icon = builder.build(app)?;
        Ok((icon, show, quit))
    }

    /// Drop the tray icon — the user switched back to quit-on-close and a
    /// leftover icon would promise something the app no longer does.
    pub fn remove(app: &AppHandle) {
        let Some(state) = app.try_state::<TrayState>() else {
            return;
        };
        if let Ok(mut guard) = state.icon.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = state.items.lock() {
            *guard = None;
        }
        // Dropping our handle is not enough: Tauri keeps a clone in its own
        // resource table, so the icon has to be taken out of there to actually
        // leave the tray.
        let _ = app.remove_tray_by_id(TRAY_ID);
    }

    pub fn is_available(app: &AppHandle) -> bool {
        let Some(state) = app.try_state::<TrayState>() else {
            return false;
        };
        let guard = match state.icon.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.is_some()
    }

    /// Re-label the tray from the frontend's translations. Stored even when no
    /// icon exists yet so a later `ensure` builds it already localized.
    pub fn set_labels(app: &AppHandle, show_label: String, quit_label: String) {
        let Some(state) = app.try_state::<TrayState>() else {
            return;
        };
        if let Ok(mut guard) = state.labels.lock() {
            *guard = (show_label.clone(), quit_label.clone());
        }
        let items = match state.items.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        };
        if let Some((show, quit)) = items {
            let _ = show.set_text(show_label);
            let _ = quit.set_text(quit_label);
        }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use tauri::AppHandle;

    /// No tray on macOS — the Dock icon is the affordance. Kept as a (empty)
    /// type rather than cfg'd away entirely so `lib.rs` manages the same state
    /// on every platform.
    #[derive(Default)]
    pub struct TrayState {}

    pub fn ensure(_app: &AppHandle) -> bool {
        true
    }

    pub fn remove(_app: &AppHandle) {}

    /// Always reachable: the Dock icon never goes away.
    pub fn is_available(_app: &AppHandle) -> bool {
        true
    }

    pub fn set_labels(_app: &AppHandle, _show_label: String, _quit_label: String) {}
}

pub use imp::{ensure, is_available, remove, set_labels, TrayState};

/// Localize the tray menu. Called by the frontend once i18n is ready and again
/// on every language change; a no-op on macOS.
#[tauri::command]
pub fn tray_set_labels(app: AppHandle, show: String, quit: String) {
    set_labels(&app, show, quit);
}
