---
title: Publish to the registry
description: Sign your plugin, declare its network hosts, and publish it to the registry so anyone can install it.
group: builders
parent: plugin-sdk
order: 3
eyebrow: For builders
updated: 17 AUG 2026
readTime: 3 min read
---

Once your plugin passes conformance, publish it so it shows up in the in-app
Plugin Store.

## Sign your package

Plugins are Ed25519-signed. Generate a keypair, sign the package, and register
your public key. The terminal verifies the signature against pinned keys before
loading anything. An unsigned or tampered package will not run.

Keys carry a tier, and the tier caps the maximum privilege a package signed
with it can ever be granted. That is what makes the community tier safe to
install with one click: no key at that tier can produce a package that escapes
the sandbox, regardless of what its manifest asks for.

## Declare network hosts

Your manifest lists the exact hosts your plugin needs to reach. On desktop the
app builds a Content-Security-Policy from these declarations and the user
consents before any egress is permitted. Declare the minimum. A connector that
lists its exchange's API host is expected; one that lists a wildcard will be
treated with suspicion, and rightly.

## Publish

Push to the registry with your signing key. The listing carries your manifest,
capabilities, and declared hosts, so installers know exactly what they are
granting before they trust it.

## Or submit to the community tier

If your plugin does not need to place trades, the lower-friction route is a
pull request adding your source under
[`apps/registry/community/`](https://github.com/Pairlens/trading-terminal/tree/main/apps/registry/community).
CI validates the submission and the registry builds and signs it itself, so
there is no key for you to manage. Community plugins cannot declare `trading:*`
capabilities (`trading:bridge` included) or `rpc:solana`, which would hand them
a node URL carrying the user's API key, and they always run sandboxed.

This is the right path for indicators, panels, themes, and read-only data
sources.

Like any pull request to the terminal repo, a community submission needs a
signed Contributor License Agreement before it can be merged. The bot comments
on your first PR with a one-line instruction, you post it once, and the `cla`
check goes green. The
[contributing guide](https://github.com/Pairlens/trading-terminal/blob/main/CONTRIBUTING.md#contributor-license-agreement)
has the details, including the corporate route if your employer owns your work.

## Trust model

Non-bootstrap plugins install sandboxed. Full trust, meaning unrestricted
network and elevated APIs, is an explicit grant a user makes per plugin, never
the default. See the [security model](/docs/security-model) for how each layer
is enforced.
