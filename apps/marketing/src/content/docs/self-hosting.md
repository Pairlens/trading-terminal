---
title: Self-hosting and standalone mode
description: Run Pairlens entirely on infrastructure you control, standalone with zero cloud dependencies, or with your own private plugin registry for a desk or team.
group: institutions
order: 1
eyebrow: For institutions
updated: AUG 2026
readTime: 7 min read
---

Pairlens is source-available under the Functional Source License (FSL), which
expressly permits internal use of any kind, and every release converts to
Apache 2.0 two years after it ships. It is designed to run without any Pairlens
infrastructure. For a trading desk, a fund, or anyone with data-residency
requirements, that means the full terminal can live inside your perimeter.

## What never leaves your machines

Regardless of how you deploy it:

**Exchange credentials** are stored on each machine, in the OS keychain on
desktop or the encrypted credential vault in a browser, and used only to sign
requests to the venue. There is no server-side credential store to secure,
audit, or breach.

**Market data** streams directly between each terminal and the exchange. No
Pairlens relay sits in the path.

**Orders** go straight from the machine to the venue over the venue's own API.

**Python strategies** execute in the local runtime. Your logic never leaves the
machine that runs it.

## Standalone mode

The optional App Server (Pairlens Cloud) provides sign-in, cross-device sync,
and a hosted AI proxy. None of it is required. Build with
`VITE_APP_SERVER_URL` explicitly empty, or set `PAIRLENS_STANDALONE=1` in dev,
and the terminal runs with auth off, cloud panels hidden, and all persistence
local to the machine.

AI features still work in standalone mode: bring your own provider key (Groq,
OpenAI, Anthropic, OpenRouter for inference; Tavily or Exa for search) through
the AI plugins, and inference calls go directly from the terminal to your
chosen provider. See [AI providers](/docs/ai-providers).

## Excluding plugin families

There are two levels of control here, and picking the right one matters.

**The trader's level is the Plugin Store.** Every plugin Pairlens ships can be
uninstalled from its store page and installed again later straight from the
binary. Dropping an asset class is uninstalling its plugins: prediction markets
are Pairlens Predictions, Kalshi and Polymarket, and with those three gone
there is no prediction surface left in the terminal. Nothing needs a rebuild,
and nothing is permanent. See
[plugins](/docs/plugins-for-traders#dropping-an-asset-class).

**The deployment's level is the build.** When the decision is the
organization's rather than the user's, exclude the family so it is not in the
product at all. Not every desk wants every asset class: a bank may have no
business showing memecoin surfaces, and a crypto fund has no use for an
equities broker. Set `VITE_PAIRLENS_DISABLED_FAMILIES` at build time to a
comma-separated list of family ids and those plugins are never seeded, never
installed, never listed in the Plugin Store, and cannot be reinstalled by
anyone using that build. A stale ledger row from an earlier build is skipped
too, so flipping the switch on an existing install takes effect on the next
boot.

| Id            | Family             |
| ------------- | ------------------ |
| `cex-spot`    | Crypto Exchanges   |
| `cex-futures` | Crypto Futures     |
| `dex`         | On-Chain DEX       |
| `equities`    | Equities           |
| `predictions` | Prediction Markets |
| `ai-byok`     | AI Providers       |
| `themes`      | Themes             |

```bash
VITE_PAIRLENS_DISABLED_FAMILIES=predictions,dex
```

Two limits are deliberate. Core and Intelligence cannot be excluded, and asking
for them logs a warning and is ignored, because the shell does not boot without
them. And exclusion applies only to the plugins we ship: a third-party plugin
that happens to share a family is never uninstalled by a deployment switch,
because it is the user's, not ours. See
[plugins](/docs/plugins-for-traders#families).

## Your own plugin registry

The plugin registry ships in the same repo (`apps/registry`). Run a private
instance to curate exactly which connectors, AI providers, indicators, and
themes your team can install, then point terminals at it with
`VITE_REGISTRY_URL`.

Packages are Ed25519-signed and verified against pinned keys, and third-party
plugins run sandboxed with an explicit network allowlist. A private registry
plus a pinned key set is how you get a fixed, reviewed plugin surface across a
desk.

## Build and distribute internally

Build the desktop app from source (Rust toolchain required) and distribute it
through your own channels. Everything needed to audit, reproduce, and patch
the build is in the public repository.

Production desktop builds must set `VITE_APP_SERVER_URL` in the environment of
`tauri build`. A bare production build defaults to standalone, which is either
exactly what you want or a surprise, depending on your deployment.

## Shared strategies without a shared server

A desk that wants everyone running the same indicators and strategies can ship
them as a plugin: export a Python script from the workbench, or package several
together, sign with your own key, and serve it from your private registry. Each
trader installs it, and each trader's copy still runs locally against their own
credentials.

## Build-time environment

Everything that shapes a deployment is set when you build the terminal:

| Variable                          | What it does                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `VITE_APP_SERVER_URL`             | The App Server to talk to. Explicitly empty means standalone                         |
| `VITE_REGISTRY_URL`               | The plugin registry terminals install from                                           |
| `VITE_PAIRLENS_DISABLED_FAMILIES` | Comma-separated plugin families this build refuses to ship                           |
| `PAIRLENS_STANDALONE`             | Set to `1` in dev for a fully offline terminal: no auth, no cloud panels, local only |

## Where to look next

- [Security model](/docs/security-model) for the guarantee-by-guarantee
  breakdown
- [Architecture](/docs/architecture) for where each piece of data lives
- [Registry](/docs/registry) for the distribution mechanics
