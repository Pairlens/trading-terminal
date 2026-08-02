# Community plugins

Publish a Pairlens plugin by opening a **pull request that adds a folder to this directory**. No accounts, no upload API — the PR is the submission, the merge is the release.

## How it works

1. Your plugin's **source** lives here, in the open. Reviewers (and users) see exactly what ships.
2. On every PR, CI validates the submission: manifest schema, store metadata, capability policy, namespace ownership, and that the source builds under the size cap.
3. When merged, the official registry **builds your source itself** at startup and signs the resulting bundle with the Pairlens **community key**. The registry never serves bytes it didn't build from this directory.
4. Terminals install community plugins with one click, badged **Community** — and run them **permanently sandboxed**: a Web Worker with a network allowlist from your manifest. Community plugins can never read credentials, touch other plugins' data, or place trades, and the full-trust grant is never offered.

## Submission layout

```
community/<plugin-id>/
  manifest.json   # standard plugin manifest (id, capabilities, network, config…)
  store.json      # store metadata (see below)
  src/index.ts    # module entry — must export `manifest` and `createPlugin`
```

See [`pairlens-aurora-theme/`](./pairlens-aurora-theme) for a working reference submission, or [`pairlens-example-indicators/`](./pairlens-example-indicators) for a data-capability reference that ships Python chart indicators (`chart:indicator`).

### store.json

| Field             | Required | Notes                                                          |
| ----------------- | -------- | -------------------------------------------------------------- |
| `githubUser`      | yes      | Your GitHub username (lowercase). Owns the plugin's namespace. |
| `category`        | yes      | One of the registry category ids (`themes`, `exchange`, …)     |
| `tagline`         | yes      | ≤ 140 chars, shown on the store card                           |
| `longDescription` | no       | Shown on the product page                                      |
| `homepage`        | no       | Your project URL                                               |
| `posterImage`     | no       | Absolute URL to a ≥128px square-ish brand mark                 |

## Rules

- **Naming**: the folder name is the plugin id, and the id must start with `<githubUser>-` (e.g. `janedoe-volume-profile`). CI verifies the PR author owns the namespace. The `pairlens` namespace is reserved for maintainers.
- **Capabilities**: `trading:orders` and `trading:balances` are **not allowed** in the community tier. Everything else (market data, AI providers, themes, workflow steps…) is fair game. Note that plugins contributing React UI (panels, status-bar items) require full trust, which community plugins never get — so they cannot be installed; keep community plugins sandbox-compatible.
- **Sandbox contract**: your module runs in a Web Worker. No DOM, no bare imports of host modules (`react`, `@pairlens/plugin-sdk`) at runtime, and network access only to the hosts declared in `manifest.network.hosts`.
- **Self-contained source**: `src/` must build standalone with `bun build` (the validator runs exactly what the registry runs). Keep it dependency-free or type-only.
- **License**: by submitting you agree your plugin is published under the repo's license (FSL-1.1-Apache-2.0, see [LICENSE.md](../../../LICENSE.md)) and that the [CLA](../../../CLA/individual-cla.md) covers your submission.
- **Size**: built bundle ≤ 512 KB.
- **Updates**: bump `version` in `manifest.json` in a new PR. Delisting is a PR that removes the folder (maintainers may delist at any time).

Validate locally before opening the PR:

```bash
bun apps/registry/scripts/validate-community.ts <your-plugin-id>
```

## What review does (and doesn't) promise

Maintainer review is a light skim for obvious problems — it is **not a security audit**. The real protections are structural: the sandbox, the network allowlist, the capability policy, and the fact that the registry only serves code built from the source in this folder. Users see a "Community" badge and this exact caveat before installing.

Found a malicious or broken submission? Open an issue or email the maintainer — delisting is a revert away.

## Want more than the community tier allows?

Trading capabilities, full-trust UI plugins, or private distribution are all supported through **self-hosted registries** with your own publisher key — see [`apps/registry/README.md`](../README.md). Users explicitly trust your key, and your plugins get the same rights as any official one.
