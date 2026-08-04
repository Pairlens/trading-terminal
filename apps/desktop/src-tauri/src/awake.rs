// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//! Keeps the machine awake while trading bots are armed.
//!
//! Bots run locally: no server watches the market on the user's behalf, so a
//! laptop that suspends mid-position is a real risk rather than a cosmetic one.
//! While at least one bot is armed the frontend asks us to hold a power
//! assertion (macOS `IOPMAssertion`, Windows `SetThreadExecutionState`, Linux
//! `systemd-inhibit`), and releases it as soon as the last bot stops.
//!
//! Only *idle* sleep is inhibited. Closing the lid or choosing Sleep still
//! suspends the machine — we hold the system open, we do not fight the user.

use std::sync::Mutex;

/// The live assertion, if any. `None` means nothing is being kept awake.
#[derive(Default)]
pub struct AwakeState(Mutex<Option<keepawake::KeepAwake>>);

/// Acquire or release the power assertion.
///
/// Returns whether an assertion is held afterwards. Failure to acquire is
/// reported as an error string rather than swallowed: the frontend downgrades
/// to a visible warning, because a user who believes their bots are protected
/// from sleep when they aren't is worse off than one who was told plainly.
#[tauri::command]
pub fn sleep_block_set(
    state: tauri::State<'_, AwakeState>,
    blocked: bool,
    reason: String,
) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if !blocked {
        // Dropping the assertion is what releases it.
        *guard = None;
        return Ok(false);
    }
    if guard.is_some() {
        // Already held — re-acquiring would leak the previous assertion on
        // platforms that reference-count them.
        return Ok(true);
    }
    let awake = keepawake::Builder::default()
        .display(false)
        .idle(true)
        .sleep(true)
        .reason(reason)
        .app_name("Pairlens")
        .app_reverse_domain("finance.pairlens")
        .create()
        .map_err(|e| e.to_string())?;
    *guard = Some(awake);
    Ok(true)
}

/// Whether an assertion is currently held. Lets the UI recover its indicator
/// after a webview reload without the frontend having to remember.
#[tauri::command]
pub fn sleep_block_active(state: tauri::State<'_, AwakeState>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
}

/// Drop the assertion from the Rust side, with no webview involved.
///
/// The assertion is normally released by the bot runtime, which lives in the
/// webview. When the last window is destroyed that runtime dies without ever
/// getting the chance — and the process outlives it (macOS keeps the app in the
/// Dock), so the machine would be held awake for bots that no longer exist,
/// for as long as the app is open. Called from the last-window-destroyed
/// handler; releasing an assertion nobody holds is a no-op.
pub fn release(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(state) = app.try_state::<AwakeState>() else {
        return;
    };
    let mut guard = match state.0.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    // Dropping the assertion is what releases it.
    *guard = None;
}
