---
title: Desktop app
description: The Pairlens desktop app for macOS, Windows, and Linux. OS-keychain credential storage, direct exchange connections, and signed auto-updates.
group: get-started
order: 4
eyebrow: Get started
updated: AUG 2026
readTime: 3 min read
---

The Tauri desktop app is the strongest home for live-trading secrets. It wraps
the same terminal that runs in your browser in a native shell and adds the
things a browser tab cannot: a first-class OS credential store, direct exchange
connections that no CORS policy can block, multiple windows, native
notifications, and the ability to keep the machine awake while a bot runs.

## Credential storage

On desktop, exchange API keys and wallet secrets are stored in the OS keychain:

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service

These are reached through the `keychain_*` Tauri commands, backed by the Rust
`keyring` crate. In a browser, credentials live in the encrypted vault instead:
AES-256-GCM ciphertext in localStorage, unlocked by a vault password, a
passkey, or Touch ID on macOS. The vault resists reading secrets off disk but
not same-origin XSS, which is why desktop remains the strongest home for
live-trading secrets.

## What desktop adds

**Direct venue access.** Eight venues (Coinbase, Gate, KuCoin, MEXC, Bitfinex,
Kalshi, KuCoin Futures, and Kraken Futures) serve no CORS headers, so a browser
cannot reach them. On desktop, connector REST calls route through the native
HTTP plugin, so all 20 venues work without a proxy.

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
