---
title: Security model
description: What Pairlens guarantees about credentials, plugin isolation, package signing, and network egress, and how each guarantee is enforced.
group: institutions
order: 2
eyebrow: For institutions
updated: AUG 2026
readTime: 5 min read
---

Pairlens is designed so that the sensitive parts of a trading setup, keys and
order flow, never leave the operator's machine. This page states each
guarantee and how it is enforced, so a security review has something concrete
to check against the source.

## Credentials

**Guarantee.** Exchange API keys and wallet private keys are never transmitted
to or stored on a Pairlens server, in any deployment, signed in or not.

**Enforcement.** On desktop they are written to the OS keychain (macOS
Keychain, Windows Credential Manager, Linux Secret Service) through Tauri
commands backed by the Rust `keyring` crate. In browser builds they are
AES-256-GCM encrypted with a non-extractable WebCrypto key held in IndexedDB.

The App Server has no schema for user exchange credentials, encrypted or
otherwise. There is no server-side credential store to audit, rotate, or
breach.

**Residual risk.** Browser builds resist reading secrets off disk, but not
same-origin XSS. Desktop is the supported home for live-trading secrets.

## Order flow

**Guarantee.** No order routes through Pairlens infrastructure.

**Enforcement.** Connector plugins hold the venue connections and sign requests
locally. The App Server has no exchange client and no venue credentials. The
market-data path is the same: WebSockets run from the operator's machine
directly to the exchange, with no relay.

## Plugin isolation

**Guarantee.** A third-party plugin cannot read credentials, place trades, or
reach the network beyond what it declared.

**Enforcement.** Non-bootstrap plugins run inside a Worker sandbox with a
network allowlist derived from their manifest. Full trust is an explicit,
per-plugin grant a user makes, never a default.

Community-tier plugins are clamped to the sandbox permanently. A community
plugin that requests main-app privileges is refused at install rather than
presented as a choice.

## Package integrity

**Guarantee.** Only packages signed by a pinned key will load.

**Enforcement.** Plugin packages are Ed25519-signed and verified against
publisher keys pinned in the terminal before any code is evaluated. Keys carry
a tier, and the tier determines the maximum privilege a package signed with it
can ever be granted. The community tier has its own signing key and its own
ceiling.

## Network egress

**Guarantee.** On desktop, the application can only reach hosts that are either
part of the baseline or explicitly consented to.

**Enforcement.** The desktop shell builds a Content-Security-Policy at runtime
from the bundled connector baseline plus the hosts declared by installed
plugins, and injects it per web resource request. A user consents before a
plugin's hosts are added. A plugin declaring one API host cannot call a
different one.

For an air-gapped or tightly-controlled deployment, this is the layer to
inspect: the effective `connect-src` is the complete list of destinations the
application can reach.

## Data residency

Run standalone and nothing leaves the perimeter. Build with
`VITE_APP_SERVER_URL` explicitly empty, or set `PAIRLENS_STANDALONE=1` in dev,
and auth is off, cloud panels are hidden, and all persistence is local to the
machine.

With an App Server, what syncs is workspaces, chart layouts, alerts, workflows,
the trade journal, AI conversations, and plugin settings. Credentials never do.
The complete list is what the account data export returns, which is itself a
useful audit artifact: it is the definition of what is held.

AI features work in standalone mode through bring-your-own-key provider
plugins, with inference calls going directly from the terminal to the provider
you chose.

## Python execution

User scripts run in Pyodide inside a dedicated Web Worker, with no filesystem
access outside their own script directory and no host API surface beyond the
candle arrays they are passed. Compute is capped at 10 seconds and package
installs at 60. A runaway script terminates the worker, which respawns.

Package installs reach PyPI and the Pyodide distribution, both of which are in
the desktop CSP baseline. An environment that must not fetch wheels should
restrict that at the network layer and rely on preinstalled packages.

## Auditability

The terminal, the connectors, the plugin system, the CLI, the registry, and the
desktop shell are all in the public repository under FSL-1.1-Apache-2.0, which
permits internal use of any kind, and every release converts to Apache 2.0 two
years after it ships. The chart engine is a separate MIT package.

The one component whose source is not yet published is the optional App Server,
which by design holds no credentials and touches no exchange. A deployment that
does not run it has nothing unpublished in its trust boundary.

## Related

- [Self-hosting and standalone mode](/docs/self-hosting)
- [Architecture](/docs/architecture)
- [Publish to the registry](/docs/publish-to-registry) for the publisher side
  of the trust model
