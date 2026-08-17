---
title: Registry
description: How the plugin registry distributes third-party connectors, AI providers, indicators, and themes, with signatures and declared network hosts.
group: builders
order: 6
eyebrow: For builders
updated: 17 AUG 2026
readTime: 2 min read
---

The registry is where third-party plugins live. The in-app Plugin Store reads
from it, so anything published becomes installable at runtime with no rebuild
of the terminal.

## What a listing carries

- The plugin **manifest** and declared **capabilities**
- The **Ed25519 signature** and publisher public key
- The exact **network hosts** the plugin needs, surfaced to the user before
  install
- Platform compatibility, so a desktop-only plugin is not offered in a browser
  build

## Two publishing paths

**Self-published.** You sign the package with your own key and publish it. The
terminal verifies against pinned keys before loading.

**Community tier.** You open a pull request adding your source under
`apps/registry/community/`. CI validates it (schema, capability policy,
namespace ownership, build, size cap), and the registry builds and signs it
itself with a separate community key. Community plugins are badged as such and
run permanently sandboxed, which is what lets them be installed with one click.

Community submissions cannot declare `trading:*` capabilities, `trading:bridge`
included. A plugin that needs to place orders or move funds across chains takes
the self-published path and an explicit trust grant from each user. `rpc:solana`
is denied too, for a different reason: it hands its consumer a node URL with the
user's own API key embedded in it.

## Installing from the store

Browse the Plugin Store, pick a plugin, review its declared hosts and its
badge, and install. Non-bootstrap plugins arrive sandboxed. You grant more only
if you choose to.

## Self-hosting

The registry is a small server in this repo (`apps/registry`). Run your own for
a private catalog and point terminals at it with `VITE_REGISTRY_URL`. See
[self-hosting](/docs/self-hosting).
