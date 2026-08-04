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

Run it on a Mac with a Touch ID sensor. Steps 10 and 11 need a second machine
or a release build.

## Setup

```bash
bun run dev:desktop
```

Note the single-instance handoff: if a Pairlens app is already running, this
exits 0 and focuses that one. Quit any running instance first, or you will QA
the wrong binary.

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

3. **The keychain item exists, and the guard is real rather than merely
   requested.** Keychain Access → search `finance.pairlens.desktop.biometric` →
   the item is there, and its Access Control tab shows the biometric
   constraint. It must NOT be in the `finance.pairlens.desktop` service
   alongside ordinary credentials.

   Then ask a **different binary** to read it, from Terminal:

   ```bash
   security find-generic-password -s finance.pairlens.desktop.biometric -w
   ```

   Expected: a Touch ID prompt, or a refusal. **A finding, and a blocker:** the
   KEK printed to the terminal with no gesture at all.

   _Why this half of the step exists:_ the item lands in the macOS
   **file-based** keychain (`use_protected_keychain()` needs
   `features = ["OSX_10_15"]` plus an entitlement — see step 11), where
   `kSecAttrAccessible*` is not what governs access and the biometric ACL is the
   OS's behaviour to demonstrate rather than something `SecItemAdd` returning
   `Ok` proves. Pairlens cannot ask this question of itself — the creating app
   is the one identity the ACL is most likely to wave through. If the bytes come
   out unguarded, the protector is decoration: pull the Touch ID card rather
   than ship the copy in `security.vault.biometricInvalidated`.

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

10. **Absence is silent.** On a Mac with no Touch ID sensor, and on a Windows
    or Linux build: no Touch ID card in enrollment, no Touch ID button in the
    unlock dialog, none on the lock screen. The probe — not `isStandalone` —
    is what gates every one of them.

11. **Release build.** `bun run tauri build` (Developer ID signed), install on
    a clean profile, repeat 2, 3, 4 and 7.
    _Why this one is not optional:_ macOS file-based keychain ACLs are bound to
    the creating app's code signature. An item created by the ad-hoc-signed dev
    binary and read by the Developer-ID-signed release binary can produce an
    unexpected "wants to access" prompt or `errSecAuthFailed`, which this code
    reports as `invalidated`. The dev build cannot surface that difference.
    If it bites: the data-protection keychain
    (`PasswordOptions::use_protected_keychain()`) needs
    `security-framework = { version = "3", features = ["OSX_10_15"] }` **and** a
    keychain-access-groups / application-identifier entitlement that Developer
    ID signing does not grant by default (`errSecMissingEntitlement`, -34018).
    That is a materially bigger change — do not assume it works.

## The one open question

The second half of step 3, and step 7, are not routine regression checks.
Together they are the only
evidence that the two properties this protector rests on — an access control the
OS enforces, and invalidation when the fingerprint set changes — hold on the
**file-based** keychain the item actually lives in. Nothing in the code proves
either: `SecItemAdd` returning `Ok` says the item was stored, not that the ACL
was honoured, and `kSecAttrAccessible*` is documented against the data
protection keychain. Until both steps pass on a release build, treat Touch ID as
an unverified convenience and keep the copy that promises invalidation out of
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
