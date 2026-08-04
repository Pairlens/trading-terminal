// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//! Touch ID as a credential-vault protector (macOS).
//!
//! The vault's data key is wrapped independently by each enrolled protector. A
//! password derives its wrapping key from what the user types; a passkey gets
//! it from the WebAuthn PRF extension — which the packaged desktop app cannot
//! use, because `tauri://localhost` is not a valid WebAuthn origin. So on a Mac
//! the biometric hardware sitting right there is unreachable through the web
//! platform, and this module is how it becomes reachable.
//!
//! The mechanism is deliberately boring: a random 32-byte KEK is stored as a
//! keychain item whose `SecAccessControl` carries the biometry constraint, so
//! macOS raises the Touch ID prompt when — and only when — something reads it.
//! Nothing here knows about the vault; it hands the KEK to the frontend, which
//! does the AES-GCM wrap with the same tested code every other protector uses.
//!
//! `kSecAccessControlBiometryCurrentSet` is the constraint we ASK for, not
//! `BiometryAny`: enrolling a new fingerprint on the Mac should invalidate the
//! item rather than silently extend vault access to whoever's finger was just
//! added. The cost is that a legitimate re-enrollment kills the protector,
//! which is why the frontend has an explicit "set it up again" path instead of
//! a silent retry.
//!
//! WHICH KEYCHAIN: the DATA PROTECTION keychain, explicitly —
//! `use_protected_keychain()` is set on every query this module builds. That
//! is not a preference but a consequence: `SecItemAdd` refuses to combine a
//! biometric `SecAccessControl` with the legacy file-based keychain at all
//! (measured: `errSecMissingEntitlement`, -34018, from an unentitled binary),
//! so the data protection keychain is the only place this item can exist. Its
//! price is that the process must carry the `com.apple.application-identifier`
//! entitlement, which only arrives via code signing with an embedded
//! provisioning profile — see Entitlements.plist and
//! tauri.provisioned.conf.json next to this crate. A `tauri dev` binary is
//! ad-hoc signed and carries no entitlements, so on dev builds every store
//! fails with -34018. That is why `available()` does not stop at the LAContext
//! hardware check: it dry-runs the exact store `create` would perform, and a
//! build that cannot finish an enrollment answers "unavailable" up front
//! instead of offering a Touch ID card that fails at the last step. Whether
//! the biometry constraint truly invalidates on a fingerprint change remains
//! the OS's behaviour to demonstrate — steps 3 and 7 of
//! docs/MANUAL-QA-BIOMETRIC-VAULT.md decide that on a provisioned build.
//!
//! THE TRADEOFF, stated rather than left implicit: the KEK crosses the Tauri
//! IPC boundary as base64 and lives in a JS string until the wrap/unwrap
//! finishes. A JS string cannot be wiped. That is the same exposure the DEK
//! itself already has in that process, and the alternative — doing the AES-GCM
//! wrap here in Rust — would move the vault's crypto out of the one place it is
//! tested. Accepted, deliberately.
//!
//! Windows and Linux compile the stub at the bottom: the probe answers `false`
//! and the UI simply never offers biometrics there.

/// Separate from `KEYCHAIN_SERVICE` in lib.rs on purpose: these items have a
/// biometric ACL, and mixing them into the service that holds ordinary
/// credentials would make a plain `keychain_get` raise a Touch ID prompt.
#[cfg(target_os = "macos")]
const SERVICE: &str = "finance.pairlens.desktop.biometric";

/// Bytes of the key-encryption key handed to the frontend.
#[cfg(target_os = "macos")]
const KEK_BYTES: usize = 32;

// OSStatus values. `errSecItemNotFound` and friends are not all exported by
// `security-framework-sys`, so they are declared here against Apple's
// SecBase.h rather than reached for through a private path.
#[cfg(any(target_os = "macos", test))]
const ERR_USER_CANCELED: i32 = -128;
#[cfg(any(target_os = "macos", test))]
const ERR_AUTH_FAILED: i32 = -25293;
#[cfg(any(target_os = "macos", test))]
const ERR_ITEM_NOT_FOUND: i32 = -25300;
#[cfg(any(target_os = "macos", test))]
const ERR_INTERACTION_NOT_ALLOWED: i32 = -25308;
#[cfg(any(target_os = "macos", test))]
const ERR_MISSING_ENTITLEMENT: i32 = -34018;
/// What `SecItemAdd` answers when it will not take the access control we asked
/// for — the shape the file-based keychain can produce for a biometric ACL.
#[cfg(any(target_os = "macos", test))]
const ERR_PARAM: i32 = -50;

/// Map an OSStatus onto the kind string the frontend switches on.
///
/// The one judgement call is `errSecAuthFailed`. macOS reports it both when the
/// access control can no longer be satisfied (the enrolled fingerprint set
/// changed, which is exactly what `BiometryCurrentSet` is for) and when the
/// user simply failed to authenticate. There is no status that distinguishes
/// them, so this reports the state that needs an action — the protector is
/// treated as dead and the UI offers to re-enroll it. Reporting "wrong
/// password" instead would send someone to the destructive reset over a
/// fingerprint they can just add again.
///
/// `errSecParam` is grouped with the unavailable states rather than left to the
/// generic bucket: a keychain that refuses the biometric access control means
/// this machine cannot offer the protector at all. As `failed` it reached the
/// user as a raw OSStatus string; as `unavailable` the frontend says the one
/// true thing there is to say and stops offering the card.
#[cfg(any(target_os = "macos", test))]
fn kind_for(code: i32) -> &'static str {
    match code {
        ERR_USER_CANCELED => "cancelled",
        ERR_AUTH_FAILED | ERR_ITEM_NOT_FOUND => "invalidated",
        ERR_INTERACTION_NOT_ALLOWED | ERR_MISSING_ENTITLEMENT | ERR_PARAM => "unavailable",
        _ => "failed",
    }
}

// ── macOS ───────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod imp {
    use super::{kind_for, ERR_ITEM_NOT_FOUND, KEK_BYTES, SERVICE};

    use base64::Engine;
    use security_framework::access_control::{ProtectionMode, SecAccessControl};
    use security_framework::base::Error as SfError;
    use security_framework::passwords::{
        delete_generic_password_options, generic_password, set_generic_password_options,
        AccessControlOptions, PasswordOptions,
    };
    use zeroize::Zeroize;

    fn describe(err: SfError) -> String {
        let code = err.code();
        let detail = err
            .message()
            .unwrap_or_else(|| String::from("no description"));
        format!("{}: {detail} (OSStatus {code})", kind_for(code))
    }

    fn encode(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    /// A query naming exactly one item. Deliberately carries no label: a label
    /// pushed here becomes a MATCH constraint, so a user who switched the app's
    /// language would stop finding their own key.
    ///
    /// Every path goes through here, so every path targets the data protection
    /// keychain. Splitting that — adding to one keychain and searching the
    /// other — is the failure mode `kSecUseDataProtectionKeychain` exists to
    /// prevent, and it must be set on reads and deletes, not just the add.
    fn query(account: &str) -> PasswordOptions {
        let mut options = PasswordOptions::new_generic_password(SERVICE, account);
        options.use_protected_keychain();
        options
    }

    /// The `SecAccessControl` every store uses — the probe must ask for exactly
    /// what `create` asks for, or it answers a different question.
    fn biometric_access_control() -> Result<SecAccessControl, SfError> {
        SecAccessControl::create_with_protection(
            // No passcode means nothing to fall back to and nothing to bind
            // to; `ThisDeviceOnly` keeps the key out of any keychain sync.
            Some(ProtectionMode::AccessibleWhenPasscodeSetThisDeviceOnly),
            AccessControlOptions::BIOMETRY_CURRENT_SET.bits(),
        )
    }

    /// True when this Mac can COMPLETE a biometric enrollment — hardware
    /// present AND this build allowed to store an item behind a biometric ACL.
    ///
    /// The second half matters as much as the first: the data protection
    /// keychain refuses processes without the application-identifier
    /// entitlement (-34018), which an ad-hoc-signed dev binary never has. The
    /// LAContext check alone would offer a Touch ID card whose final step
    /// cannot succeed.
    pub fn available() -> bool {
        use objc2_local_authentication::{LAContext, LAPolicy};
        // SAFETY: `LAContext` has no initialization preconditions, and both
        // selectors are plain Objective-C calls on a context this scope owns
        // and drops. No pointer crosses the boundary.
        let hardware = unsafe {
            let context = LAContext::new();
            context
                .canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
                .is_ok()
        };
        hardware && can_store_biometric_item()
    }

    /// Dry-run of the exact store `create` performs, then clean up.
    ///
    /// Writes behind a biometric ACL never prompt — only reads do — so this is
    /// silent. The fixed account cannot collide with a real protector: those
    /// use freshly generated UUIDs. The stored byte is a constant; nothing
    /// secret exists before the delete.
    fn can_store_biometric_item() -> bool {
        const PROBE_ACCOUNT: &str = "availability-probe";
        let _ = delete_generic_password_options(query(PROBE_ACCOUNT));
        let Ok(access) = biometric_access_control() else {
            return false;
        };
        let mut options = query(PROBE_ACCOUNT);
        options.set_access_control(access);
        let stored = set_generic_password_options(&[0u8], options).is_ok();
        if stored {
            let _ = delete_generic_password_options(query(PROBE_ACCOUNT));
        }
        stored
    }

    /// Generate a KEK, store it behind the biometric ACL, and hand it back ONCE.
    ///
    /// The item is deleted first rather than updated: `set_generic_password`
    /// falls back to `SecItemUpdate` on a duplicate, and updating an item that
    /// already has a biometric ACL would raise a prompt in the middle of what is
    /// supposed to be an enrollment.
    pub fn create(account: &str, label: &str) -> Result<String, String> {
        let _ = delete_generic_password_options(query(account));

        let access = biometric_access_control().map_err(describe)?;

        let mut options = query(account);
        options.set_access_control(access);
        // The only place a localized string can reach macOS through this API:
        // the prompt sentence is composed by the OS around the item's label.
        options.set_label(label);

        let mut kek = [0u8; KEK_BYTES];
        getrandom::getrandom(&mut kek).map_err(|e| format!("failed: {e}"))?;
        let result = set_generic_password_options(&kek, options)
            .map(|()| encode(&kek))
            .map_err(describe);
        kek.zeroize();
        result
    }

    /// Read the KEK back. THIS is the call that raises the Touch ID prompt.
    pub fn read(account: &str) -> Result<String, String> {
        let mut bytes = generic_password(query(account)).map_err(describe)?;
        let encoded = encode(&bytes);
        bytes.zeroize();
        Ok(encoded)
    }

    /// Remove the OS-side material. An item that is already gone is a success —
    /// this runs on paths (protector removal, teardown, device erase) where the
    /// goal is "it is not there", not "we were the ones who removed it".
    pub fn delete(account: &str) -> Result<(), String> {
        match delete_generic_password_options(query(account)) {
            Ok(()) => Ok(()),
            Err(err) if err.code() == ERR_ITEM_NOT_FOUND => Ok(()),
            Err(err) => Err(describe(err)),
        }
    }
}

// ── Everything else ─────────────────────────────────────────────────

#[cfg(not(target_os = "macos"))]
mod imp {
    // TODO(windows): Windows Hello via KeyCredentialManager (windows-rs
    //  Security::Credentials). Not written here: it cannot be exercised or
    //  tested on this machine, and untestable WinRT code in a credential path
    //  is worse than an honest "unavailable".
    pub fn available() -> bool {
        false
    }

    pub fn create(_account: &str, _label: &str) -> Result<String, String> {
        Err(String::from(
            "unavailable: no biometric store on this platform",
        ))
    }

    pub fn read(_account: &str) -> Result<String, String> {
        Err(String::from(
            "unavailable: no biometric store on this platform",
        ))
    }

    pub fn delete(_account: &str) -> Result<(), String> {
        Err(String::from(
            "unavailable: no biometric store on this platform",
        ))
    }
}

// ── Commands ────────────────────────────────────────────────────────
//
// Every one hops to a blocking thread, exactly like `keychain_*` in lib.rs:
// the Touch ID prompt blocks its caller until the user answers it.

#[tauri::command]
pub async fn biometric_available() -> bool {
    tauri::async_runtime::spawn_blocking(imp::available)
        .await
        .unwrap_or(false)
}

/// Returns the fresh KEK as base64. The only time it is ever handed out on the
/// create path — after this, reading it costs a biometric gesture.
#[tauri::command]
pub async fn biometric_create(account: String, label: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || imp::create(&account, &label))
        .await
        .map_err(|e| format!("failed: {e}"))?
}

/// `reason` is unused on the read path by design — see `query()`: a label on a
/// match query is a match constraint. It stays in the signature because the
/// frontend passes one localized string per operation and dropping it from the
/// contract would quietly make a future prompt un-localizable.
#[tauri::command]
pub async fn biometric_read(account: String, reason: String) -> Result<String, String> {
    let _ = reason;
    tauri::async_runtime::spawn_blocking(move || imp::read(&account))
        .await
        .map_err(|e| format!("failed: {e}"))?
}

#[tauri::command]
pub async fn biometric_delete(account: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || imp::delete(&account))
        .await
        .map_err(|e| format!("failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        kind_for, ERR_AUTH_FAILED, ERR_INTERACTION_NOT_ALLOWED, ERR_ITEM_NOT_FOUND,
        ERR_MISSING_ENTITLEMENT, ERR_PARAM, ERR_USER_CANCELED,
    };

    #[test]
    fn maps_status_codes_onto_the_states_the_ui_distinguishes() {
        // A dismissed prompt is not a failed guess — the frontend must be able
        // to tell them apart or an accidental Escape counts against the shared
        // lock backoff.
        assert_eq!(kind_for(ERR_USER_CANCELED), "cancelled");
        // Both of these mean "this protector is dead, offer to re-enroll".
        assert_eq!(kind_for(ERR_AUTH_FAILED), "invalidated");
        assert_eq!(kind_for(ERR_ITEM_NOT_FOUND), "invalidated");
        // The machine cannot answer right now; nothing is wrong with the vault.
        assert_eq!(kind_for(ERR_INTERACTION_NOT_ALLOWED), "unavailable");
        assert_eq!(kind_for(ERR_MISSING_ENTITLEMENT), "unavailable");
        // The keychain refused the biometric access control. The protector
        // cannot exist on this machine, and saying so beats a raw OSStatus.
        assert_eq!(kind_for(ERR_PARAM), "unavailable");
        // Anything unrecognised must not be silently absorbed into a state the
        // UI treats as benign.
        assert_eq!(kind_for(-1), "failed");
        assert_eq!(kind_for(0), "failed");
    }
}
