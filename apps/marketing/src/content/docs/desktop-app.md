---
title: Desktop app
description: Why the desktop app is the primary distribution, how credentials are stored, and how auto-updates work.
group: get-started
order: 4
eyebrow: Get started
updated: AUG 2026
readTime: 3 min read
---

The Tauri desktop app is the supported home for live trading. It wraps the same
terminal in a native shell and adds the things a browser tab cannot: a
first-class OS credential store, direct exchange connections that no CORS
policy can block, multiple windows, native notifications, and the ability to
keep the machine awake while a bot runs.

## Credential storage

On desktop, exchange API keys and wallet secrets are stored in the OS keychain:

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service

These are reached through the `keychain_*` Tauri commands, backed by the Rust
`keyring` crate. Browser dev builds fall back to AES-256-GCM-encrypted
localStorage, which resists reading secrets off disk but not same-origin XSS,
so desktop is the recommended home for live-trading secrets.

## What desktop adds

**Direct venue access.** Several exchanges serve no CORS headers. On desktop,
connector REST calls route through the native HTTP plugin, so those venues work
without a proxy.

**Multiple windows.** <kbd>⌘N</kbd> duplicates the current view into its own
window. State stays in sync, and one window is elected leader so notifications
fire once.

**Native notifications.** Alert rules can post to the OS notification centre
instead of a toast that only exists while the app is focused.

**Keep awake.** While a bot is running, the app can block idle sleep so your
strategy is not silently stopped by a lid closing.

**Screenshots to disk.** Chart images save to a real folder rather than the
browser download sandbox.

## Auto-updates

Installed apps poll the latest release, verify a minisign signature against a
pinned public key, download, and relaunch. Updates are cryptographically
verified end to end, so a tampered build will not install. You can also trigger
a check by hand from the app menu.

## Get a build

Grab a prebuilt binary for macOS, Windows, or Linux from the
[install page](/install), or build from source with `bun run dev:desktop`
(requires the Rust toolchain).
