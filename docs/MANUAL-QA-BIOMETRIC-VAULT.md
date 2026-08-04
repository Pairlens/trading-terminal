<!--
Copyright (c) 2026 Juan Ignacio Molina Estrada
SPDX-License-Identifier: FSL-1.1-Apache-2.0
-->

# Manual QA — Touch ID vault protector (macOS)

Nothing in CI touches this path. `cargo check` and `clippy -D warnings` prove
`src/biometric.rs` compiles; the TypeScript suite proves the derivation, the
AAD binding and the error mapping against a fake port. A real Touch ID prompt
cannot be raised headlessly, so the list below is the only thing that covers
the parts that matter.

Run it on a Mac with a Touch ID sensor, **on a provisioned build**. A `tauri
dev` binary is ad-hoc signed with no entitlements, and the data protection
keychain — the only keychain that accepts a biometric access control — refuses
it (`errSecMissingEntitlement`, -34018). On a dev build the availability probe
answers false and the Touch ID card simply never appears; that is correct
behaviour, not a QA pass.

## Setup

Requires `Pairlens_DevID.provisionprofile` in `apps/desktop/src-tauri/` (see
docs/RELEASING.md, "Provisioning profile") and the Developer ID certificate in
the login keychain.

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Juan Ignacio Molina Estrada (UMJ33RFLWS)" \
  CI=true bun run tauri build --config ./src-tauri/tauri.provisioned.conf.json
```

(No `--` before `--config` — bun forwards the literal `--` and the Tauri CLI
then hands everything after it to cargo, whose own `--config` flag chokes on
the path. `CI=true` skips the DMG Finder styling, which needs an interactive
Automation grant.)

Install and launch the bundled app from
`apps/desktop/src-tauri/target/release/bundle/macos/`. Quit any running
Pairlens instance first — the single-instance handoff would focus the wrong
binary.

## Cases

1. **The card is additive only.** Settings → Security with **no vault**: the
   Touch ID card must NOT appear. Enroll a password first.
   _Why:_ `createVault` refuses to make biometrics the only protector — macOS
   invalidates the key whenever the enrolled fingerprints change, and a vault
   with nothing else in it would be one System Settings visit from unopenable.

2. **Enrollment.** "Add another way in" → Touch ID → enter the vault password →
   **exactly one** Touch ID prompt appears. Afterwards the protector row shows
   the localized label ("Touch ID on this Mac").
   A second prompt here means the create path is updating an existing item
   instead of replacing it.

3. **The item is isolated where it should be.** The KEK lives in the **data
   protection keychain** (`kSecUseDataProtectionKeychain` on every call), which
   the legacy tooling cannot see. From Terminal:

   ```bash
   security find-generic-password -s finance.pairlens.desktop.biometric -w
   ```

   Expected: **"could not be found"** — the `security` CLI only reads
   file-based keychains, and Keychain Access will not list the item either.
   **A finding, and a blocker:** the KEK printed to the terminal, which would
   mean the item landed in the file-based keychain after all and the access
   control story needs re-verification from scratch.

   The biometric ACL itself is exercised by steps 4–7: every read must cost a
   gesture. `SecItemAdd` returning `Ok` proves the item stored, not that the
   constraint is enforced — the unlock steps are what prove that.

4. **Unlock after a hard lock.** Settings → Security → Hard lock. The unlock
   dialog offers "Unlock with Touch ID" → touch → the vault opens and the
   parked-bots banner clears.

5. **No double punishment.** Cancel the prompt (Esc, or "Use Password") **six
   times in a row**. Expected each time: back to idle, the copy names the
   Touch ID prompt (not the passkey one), **no lockout**, and the password
   field still works.
   _Why:_ the OS enforces its own Touch ID retry limit and falls back to the
   account password. Counting those failures again in the app's shared backoff
   would let a passer-by mashing the wrong finger lock the owner out of their
   own password prompt — the same counter gates the screen lock.

6. **The lock screen.** Trigger the screen lock (Settings → Security → Lock
   now). The full-screen lock offers "Unlock with Touch ID"; using it unlocks
   the screen and the vault in one step.

7. **Invalidation — the case worth the whole feature.** System Settings →
   Touch ID & Password → **add or delete a fingerprint**. Return to Pairlens
   and press "Unlock with Touch ID".
   Expected: the distinct "the fingerprints on this Mac changed — remove it in
   Settings → Security and set it up again" copy, and the button stops
   re-prompting.
   **Not** expected, and a real finding if seen: a silent fall back to the
   account password, or "wrong password". If macOS silently accepts the login
   password here instead of failing, the protector is weaker than the copy
   claims and the copy has to change.

8. **Removal cleans up the OS side.** Remove the Touch ID protector in
   Settings → Security → confirm the Keychain Access item from step 3 is gone.

9. **Destructive reset cleans up too.** Lock screen → "Forgot password" →
   type RESET → confirm the Keychain Access item is gone.
   _Why:_ the record is the only thing that remembers the keychain account, so
   an item left behind here can never be found or removed again.

10. **Absence is silent.** On a Mac with no Touch ID sensor, on a Windows or
    Linux build, **and on any unprovisioned build** (`tauri dev`, or a build
    without the profile): no Touch ID card in enrollment, no Touch ID button
    in the unlock dialog, none on the lock screen. The probe — a dry-run of
    the actual keychain store, not `isStandalone`, not the LAContext hardware
    check alone — is what gates every one of them.

11. **The shipped artifact.** Repeat 2, 3, 4 and 7 on an installer produced by
    the Release workflow (which applies the same provisioned overlay when the
    profile is committed), not just the local build from Setup. Same signing
    identity, but notarization and the DMG path are only proven by the real
    pipeline.

## The one open question

Step 7 is not a routine regression check. It is the only evidence that
invalidation-on-fingerprint-change — the property `BiometryCurrentSet` is for,
and the one the copy in `security.vault.biometricInvalidated` promises — holds
in practice. `SecItemAdd` returning `Ok` says the item stored, not that the
constraint is enforced. Until step 7 passes on a provisioned build, treat
Touch ID as an unverified convenience and keep the invalidation promise out of
anything a user reads outside the app.

## Known limits

- The localized prompt sentence is composed by macOS around the keychain
  item's **label**, set at enrollment. `PasswordOptions::push_query` is
  `pub(crate)`, so there is no way to attach `kSecUseAuthenticationContext` or
  `kSecUseOperationPrompt` through the high-level API, and the label must not
  be set on the read query (there it becomes a _match_ constraint and the
  lookup stops finding the item). Consequence: switching the app's language
  after enrolling does not re-localize the prompt. The escape hatch, if manual
  QA rejects the wording, is a hand-built read dictionary using
  `kSecUseAuthenticationContext` + `LAContext::setLocalizedReason` — both are
  available, at the cost of ~40 lines of CF/objc2 `unsafe`.
- Windows Hello is a documented follow-up, not a gap left by accident. See the
  `TODO(windows)` seam in `apps/desktop/src-tauri/src/biometric.rs`.
