---
title: Plugins
description: Add venues, AI providers, panels, indicators, and themes from the Plugin Store, and understand what each one is allowed to do.
group: traders
order: 9
eyebrow: For traders
updated: AUG 2026
readTime: 5 min read
---

Almost everything in Pairlens is a plugin, including the parts that shipped
with it. That is what lets you add an exchange, an AI provider, a panel, an
indicator, or a theme without waiting for a release.

Open **Plugins** in the left nav.

## What plugins can add

**Venues.** Market data and order routing for an exchange, broker, or DEX.

**AI providers.** Inference and web search.

**Panels.** New tiles for your workspaces.

**Indicators.** Custom chart indicators, including Python ones other people
wrote.

**Themes.** Eighteen ship in the box, and more can be installed.

**Workflow steps** and **notification channels**, extending the automation
canvases.

## Installing

Three routes:

**From the store.** Browse or search, open a plugin's page, review what it
declares, and install. One click.

**From a zip.** **Import plugin** takes a `.zip` you were sent, or that you
exported from the indicator workbench. Drag and drop onto the installed tab
works too.

**From a URL.** For plugins hosted outside the registry.

Installed plugins can be enabled, disabled, configured, or removed at any time.
Disabling Pairlens Core is possible and will empty most of your terminal, so
the app asks twice.

## Families

Every plugin we ship belongs to a family, and the **Installed** tab groups them
that way rather than listing forty entries alphabetically.

| Family                 | What is in it                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| **Core**               | The terminal itself: charts, order book, trade entry, workspaces |
| **Intelligence**       | Hosted AI, instrument discovery, news, market intelligence       |
| **Crypto Exchanges**   | The 14 centralized spot venues                                   |
| **Crypto Futures**     | Binance, KuCoin and Kraken perpetuals, the positions panel, the perps desk |
| **On-Chain DEX**       | Swap venues, DEX data providers, and the on-chain layouts        |
| **Equities**           | Alpaca and the stock layouts                                     |
| **Prediction Markets** | Kalshi, Polymarket, the event panels, the prediction layouts     |
| **AI Providers**       | Bring-your-own-key models and web search                         |
| **Themes**             | The eighteen bundled themes                                      |

Each group carries one switch that enables or disables everything inside it, so
turning off an asset class you never trade is one click rather than fourteen.
Core and Intelligence carry no switch, because the terminal does not run
without them.

Families are grouping and policy only. Nothing about a plugin's id, its
capabilities, or your saved layouts depends on which family it is in, and
plugins you installed yourself are grouped by where they came from rather than
being swept into ours.

What a family does take with it is its ready-made layouts. An asset-class
plugin ships the workspaces built for its class, so disabling Prediction
Markets removes the prediction desk and the event-market home board from the
Workspace Store, the Workspaces menu, and Discovery on the spot. Layouts you
have already saved are untouched, and enabling the family brings the ready-made
ones back. See [workspaces](/docs/workspaces).

A deployment can go further and exclude a family at build time, which is how a
desk ships a terminal with no equities surfaces at all. See
[self-hosting](/docs/self-hosting#excluding-plugin-families).

## Trust tiers

This is the part worth reading before you install something.

**Bundled.** Ships with Pairlens, runs with full access. The connectors, the
core panels, the first-party AI providers.

**Community.** Submitted by the community and reviewed lightly. The source
lives in the Pairlens repo, CI validates it, and the registry builds and signs
it itself. Community plugins **always** run in the sandbox: they can reach only
the network hosts they declare, and can never read your exchange keys, touch
your wallets, or place a trade. A community plugin that asks for full access is
refused rather than presented as a choice.

**Third-party.** Published to the registry by a developer with their own
signing key. Installs sandboxed by default. Full access is an explicit grant
you make per plugin, never a default, and the store tells you what you are
granting before you grant it.

Every package is Ed25519-signed and verified against pinned keys before it
loads. An unsigned or tampered package will not run.

## Declared network hosts

A plugin lists the exact hosts it needs to reach. On desktop, the app builds a
Content-Security-Policy from those declarations and you consent before any
traffic is permitted. A connector that declares `api.exchange.com` cannot
quietly call somewhere else.

The plugin's store page shows this list. A market connector needing its
exchange's API is expected. A theme needing network access is not.

## Themes

Eighteen themes ship in the box, from **Terminal Classic** and **Zen Trading**
through **Cyberpunk Neon**, **Sakura Bloom**, **Infrared**, **High Contrast**,
and **Boomerg**, which turns the whole terminal amber-on-black and monospace. Apply one from the Plugin Store, or from
**Settings → Appearance**, or with the omni-search **Theme** action. Light and
dark modes are independent of the theme, and **System** follows your OS.

Custom Python indicators resolve semantic colours against the active theme, so
your own indicators stay legible in all of them.

## Platform compatibility

Some plugins are desktop-only, usually because they need native capabilities a
browser cannot provide, and some are browser-only. The store badges them and
refuses to activate one on the wrong platform rather than failing at runtime.

## Building your own

The Plugin Store has a **Build your own plugin** section with the scaffold
command and the packaging steps. The host provides React, the Pairlens SDK, the
design system, and the charts engine at runtime, so your bundle stays small.
Start at the [Plugin SDK](/docs/plugin-sdk).
