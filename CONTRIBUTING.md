# Contributing to Pairlens

Thanks for your interest in contributing. This guide covers the essentials.

## Licensing model

Pairlens is source-available under the [Functional Source License](LICENSE.md) (SPDX: `FSL-1.1-Apache-2.0`). Here's what that means for the code you touch:

- You can use, modify, and self-host Pairlens freely for yourself or inside your company. The license only forbids selling a competing commercial product or service built from it.
- Each release automatically converts to [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) two years after it's published. The FSL restriction is temporary by design; the code's long-term home is a classic open-source license.
- The charting engine, [Fast Financial Charts](https://github.com/Pairlens/fast-financial-charts), lives in its own repo and is plain MIT. Nothing in this section applies there.

The reasoning behind this model is written up on [pairlens.finance/licensing](https://pairlens.finance/licensing).

## Contributor License Agreement

Before we can merge your first pull request, you need to sign the [Individual CLA](CLA/individual-cla.md). It gives the project the right to distribute your contribution under the licensing model above (including the two-year Apache 2.0 conversion) and includes a patent grant that protects every user of the software. You keep the copyright to your work.

Signing is automatic: when you open your first PR, the CLA bot comments with instructions. You post a single comment ("I have read the CLA Document and I hereby sign the CLA") and the bot records your signature in the repo. That's it, once per contributor, and the `cla` check flips to green. It's a required check, so an unsigned PR can't be merged — that's the only thing standing between a good patch and `main`.

The bot checks the author of every commit in the PR, not just whoever opened it. If you co-author or cherry-pick someone else's commits, they need to sign too, and commits authored from an email that isn't attached to a GitHub account show up as unknown. `git commit --amend --reset-author` on your own commits fixes that.

If you contribute as part of your job and your employer owns your work, your employer signs the [Corporate CLA](CLA/corporate-cla.md) instead and lists you as a designated contributor. Open an issue titled "Corporate CLA" to start that; the signed copy is exchanged privately, not in the issue.

## License headers

Every first-party source file starts with a two-line SPDX header:

```ts
// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
```

You don't need to add it by hand. If you create new files, run:

```bash
bun run license-headers:fix   # adds missing headers
bun run license-headers       # check only (what CI and the pre-commit hook run)
```

The pre-commit hook checks staged files and tells you the exact command if anything is missing.

## Dev setup

Requirements: [Bun](https://bun.sh) ≥ 1.3. Rust toolchain only if you work on the desktop app.

```bash
bun install
bun run dev        # Terminal at http://localhost:3000
```

No `.env.local` or Docker needed. Market data streams directly from exchanges and persistence is local. Cloud features (sign-in, sync, news, top coins, symbol logos) work out of the box too: the dev server targets the hosted Pairlens Cloud API (`api.pairlens.finance`) — the exact same backend the shipped app uses — so you can develop against real cloud behavior, including signing in with your own email.

App Server resolution order (see `scripts/env/resolve-app-server.ts`):

1. `VITE_APP_SERVER_URL` — explicit override (shell or `.env.local`)
2. `http://localhost:4046` — a locally-running App Server, auto-detected (maintainers)
3. `https://api.pairlens.finance` — Pairlens Cloud

`PAIRLENS_STANDALONE=1 bun run dev` opts out of all of it and runs fully offline (auth off, cloud panels hidden, local persistence only). The App Server backend's source isn't published yet; contributions here never require it.

### Git worktrees

Dev ports are derived per worktree (see `scripts/env/with-worktree-env.ts`), so multiple checkouts can run `bun run dev` simultaneously without port collisions. If you hit a rare port collision, set `TERMINAL_PORT` explicitly.

## Before opening a PR

Run the full checklist and make sure everything passes:

```bash
bun run typecheck   # zero TypeScript errors
bun run lint        # zero ESLint warnings
bun run format      # Prettier (auto-fixes)
bun run test        # all tests pass
```

CI runs the same checks plus a production build, so passing locally means a green PR.

Two git hooks are wired automatically by `bun install` via `.githooks/`: a pre-commit hook that checks staged files for the license header (see [License headers](#license-headers) below), and a pre-push hook that runs the format check and lint, so CI-failing pushes are rejected locally first. In an emergency you can bypass them with `git commit --no-verify` / `git push --no-verify`.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(trading): US equities support via Alpaca broker connector
fix(terminal): guard candle stream against stale subscriptions
docs(readme): update connector inventory
chore: bump turbo
```

Use a scope when the change is clearly bounded (`terminal`, `desktop`, `plugins`, `charts`, …). Keep the subject imperative and under ~72 characters.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Describe **what** changed and **why**; link related issues.
- Add or update tests for behavior changes (`bun test packages/<name>`).
- Market connector changes must pass the conformance suite: `bun run test:conformance`.
- Never include real exchange API keys, wallet secrets, or seed phrases in code, tests, fixtures, or PR descriptions.

## Building a plugin?

You don't need to fork the terminal — plugins (connectors, themes, AI providers) can be developed against the SDK and published to the registry. Start with `bun run create:plugin` and see `packages/plugin-sdk/` and the `examples/` workspace.
