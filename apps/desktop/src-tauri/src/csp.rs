// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Dynamic Content-Security-Policy: runtime plugin network grants ──────────
//
// The desktop webview enforces a CSP `connect-src` allowlist — an outer network
// egress boundary that applies to ALL webview code regardless of a plugin's
// trust level (sandboxed or full). A statically-compiled allowlist can only ever
// reach the first-party + bundled-connector hosts, so a third-party plugin
// installed at runtime (a workspace store, a new exchange connector, a data
// provider) could never reach its own backend.
//
// This module makes the `connect-src` derive from the baseline PLUS a persisted,
// user-consented set of plugin-declared hosts. A plugin declares the hosts it
// needs in its signed `manifest.network.hosts`; the frontend surfaces them to the
// user ("your terminal will connect to these servers"); on consent it records a
// grant here and reloads. On the next document load the injected CSP includes the
// granted hosts. The sandbox network-guard still confines each plugin to its OWN
// declared hosts, so the document-wide CSP is a ceiling, not per-plugin authority.
//
// Grants live in `<app-data>/network-grants.json` as `{ pluginId: [hosts] }` and
// are the single source of truth for the CSP — read fresh on every top-level
// document request, so a reload (not an app restart) applies a new grant.

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use tauri::http::{header, Response};
use tauri::{AppHandle, Manager};

/// CSP directives other than `connect-src`, identical to the former static
/// policy in tauri.conf.json. `connect-src` is appended dynamically.
const CSP_DIRECTIVES: &[&str] = &[
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
];

/// Baseline `connect-src` sources: local IPC + first-party (pairlens.finance) +
/// bundled connector/AI hosts + the Telegram Bot API (the notification channel
/// posts to it directly from the webview) + Python indicator runtime package
/// sources (jsDelivr serves pyodide's compiled wheels, PyPI serves pure-python
/// wheels via micropip; the pyodide core itself ships same-origin in the
/// bundle). User-consented plugin grants are unioned on top.
const BASELINE_CONNECT_SRC: &str = "'self' blob: data: ipc: tauri://localhost http://ipc.localhost asset://localhost http://asset.localhost http://localhost:* ws://localhost:* https://pairlens.finance https://*.pairlens.finance https://*.okx.com wss://*.okx.com https://*.binance.com wss://*.binance.com https://*.binance.us wss://*.binance.us https://*.bnbstatic.com https://testnet.binance.vision wss://testnet.binance.vision https://*.bybit.com wss://*.bybit.com https://*.bybit.nl wss://*.bybit.nl https://*.bitvavo.com wss://*.bitvavo.com https://*.mexc.com wss://*.mexc.com https://*.kucoin.com wss://*.kucoin.com https://*.kucoin.eu wss://*.kucoin.eu https://openapi-sandbox.kucoin.com https://*.gateio.ws wss://*.gateio.ws https://*.gateapi.io wss://*.gate.com https://*.coinbase.com wss://*.coinbase.com https://*.bitget.com wss://*.bitget.com https://*.kraken.com wss://*.kraken.com https://*.huobi.pro wss://*.huobi.pro https://*.crypto.com wss://*.crypto.com https://*.3ona.co wss://*.3ona.co https://*.bitfinex.com wss://*.bitfinex.com https://*.upbit.com wss://*.upbit.com https://*.alpaca.markets wss://*.alpaca.markets https://*.kyberswap.com https://jup.ag https://*.jup.ag https://*.dexpaprika.com https://*.geckoterminal.com https://*.publicnode.com https://*.solana.com https://api.groq.com https://api.openai.com https://api.anthropic.com https://api.telegram.org https://api.coingecko.com https://api.alternative.me https://*.posthog.com https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org";

pub type Grants = BTreeMap<String, Vec<String>>;

fn grants_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    Some(dir.join("network-grants.json"))
}

fn read_grants(app: &AppHandle) -> Grants {
    let Some(path) = grants_path(app) else {
        return Grants::new();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        return Grants::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_grants(app: &AppHandle, grants: &Grants) -> Result<(), String> {
    let path = grants_path(app).ok_or("no app data dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(grants).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// A host token is a bare hostname or a single leading `*.` wildcard. Reject
/// anything that could break out of the `connect-src` directive (spaces, quotes,
/// semicolons, schemes, paths) — defense-in-depth on top of the signed manifest.
fn is_valid_host(host: &str) -> bool {
    let h = host.strip_prefix("*.").unwrap_or(host);
    !h.is_empty()
        && h.len() <= 253
        && h.contains('.')
        && !h.starts_with('.')
        && !h.ends_with('.')
        && h.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

/// Every granted host expanded to `https://` + `wss://` sources, sorted + deduped.
fn granted_sources(app: &AppHandle) -> Vec<String> {
    let grants = read_grants(app);
    let mut out = Vec::new();
    for hosts in grants.values() {
        for host in hosts {
            if is_valid_host(host) {
                out.push(format!("https://{host}"));
                out.push(format!("wss://{host}"));
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

/// Fresh random nonce (base64 of 16 random bytes) for one HTML response.
fn generate_nonce() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("os rng");
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Build the full CSP string: static directives + baseline `connect-src` unioned
/// with the user-consented plugin host grants. `script-src` carries the given
/// response nonce plus `'strict-dynamic'`: the SPA shell boots through inline
/// scripts (plugin import map, TanStack Start's hydration bootstrap), and code
/// it runs injects further inline scripts at runtime (TanStack's streamed `$R`
/// payloads) whose content can't be known in advance — so static hashes can't
/// cover them. Nonced scripts propagate trust to the scripts they create;
/// parser-inserted markup from an injection still has no nonce and is blocked.
pub fn build_csp(app: &AppHandle, nonce: &str) -> String {
    let mut connect = String::from(BASELINE_CONNECT_SRC);
    for src in granted_sources(app) {
        connect.push(' ');
        connect.push_str(&src);
    }
    let mut directives: Vec<String> = CSP_DIRECTIVES
        .iter()
        .map(|d| {
            if let Some(rest) = d.strip_prefix("script-src ") {
                // 'self' and blob: stay for CSP2 fallback; CSP3 browsers ignore
                // them under 'strict-dynamic'.
                return format!("script-src {rest} 'nonce-{nonce}' 'strict-dynamic'");
            }
            d.to_string()
        })
        .collect();
    directives.push(format!("connect-src {connect}"));
    directives.join("; ")
}

/// Response hook for `WebviewWindowBuilder::on_web_resource_request`. Sets the CSP
/// header on the top-level HTML document (the only response where it is
/// meaningful) and marks it `no-store` so a reload always re-reads current grants.
///
/// Fires only for Tauri-served asset-protocol responses (the production bundle);
/// in dev the webview loads the external Vite `devUrl`, which this never sees.
pub fn inject_csp(app: &AppHandle, response: &mut Response<Cow<'static, [u8]>>) {
    let is_html = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/html"))
        .unwrap_or(false);
    if !is_html {
        return;
    }
    // Stamp the response nonce on every <script> tag (inline and src) so the
    // shell's scripts run under the nonce+strict-dynamic policy below.
    let nonce = generate_nonce();
    let html = String::from_utf8_lossy(response.body()).into_owned();
    let stamped = html.replace("<script", &format!("<script nonce=\"{nonce}\""));
    *response.body_mut() = Cow::Owned(stamped.into_bytes());
    // Body length changed — keep Content-Length honest or the webview truncates.
    let len = response.body().len();
    if let Ok(value) = header::HeaderValue::from_str(&len.to_string()) {
        response.headers_mut().insert(header::CONTENT_LENGTH, value);
    }
    if let Ok(value) = header::HeaderValue::from_str(&build_csp(app, &nonce)) {
        response
            .headers_mut()
            .insert(header::CONTENT_SECURITY_POLICY, value);
    }
    if let Ok(value) = header::HeaderValue::from_str("no-store") {
        response.headers_mut().insert(header::CACHE_CONTROL, value);
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

/// All current grants — the frontend reads this to decide whether a plugin's
/// declared hosts still need consent.
#[tauri::command]
pub fn network_grants_get(app: AppHandle) -> Grants {
    read_grants(&app)
}

/// Record (or replace) a plugin's granted hosts. Invalid host tokens are dropped;
/// an empty result removes the grant. Persists to disk; the caller reloads to
/// apply the widened CSP.
#[tauri::command]
pub fn network_grant_set(
    app: AppHandle,
    plugin_id: String,
    hosts: Vec<String>,
) -> Result<(), String> {
    let mut grants = read_grants(&app);
    let clean: Vec<String> = hosts.into_iter().filter(|h| is_valid_host(h)).collect();
    if clean.is_empty() {
        grants.remove(&plugin_id);
    } else {
        grants.insert(plugin_id, clean);
    }
    write_grants(&app, &grants)
}

/// Revoke a plugin's network grant (uninstall). No-op if it held none.
#[tauri::command]
pub fn network_grant_revoke(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let mut grants = read_grants(&app);
    if grants.remove(&plugin_id).is_some() {
        write_grants(&app, &grants)?;
    }
    Ok(())
}

/// The baseline host patterns already permitted without any grant (schemes and
/// ports stripped) — lets the frontend compute which of a plugin's declared hosts
/// are genuinely new without duplicating the baseline list.
#[tauri::command]
pub fn network_baseline_hosts() -> Vec<String> {
    let mut hosts: Vec<String> = BASELINE_CONNECT_SRC
        .split_whitespace()
        .filter_map(|tok| {
            let rest = tok
                .strip_prefix("https://")
                .or_else(|| tok.strip_prefix("wss://"))
                .or_else(|| tok.strip_prefix("http://"))
                .or_else(|| tok.strip_prefix("ws://"))?;
            // Drop port suffixes (e.g. localhost:*) and empty tokens.
            let host = rest.split('/').next().unwrap_or(rest);
            let host = host.split(':').next().unwrap_or(host);
            if host.is_empty() {
                None
            } else {
                Some(host.to_string())
            }
        })
        .collect();
    hosts.sort();
    hosts.dedup();
    hosts
}
