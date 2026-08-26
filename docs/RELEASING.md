# Releasing Pairlens Desktop

Pairlens ships as a Tauri desktop app with Spotify/Figma-style auto-updates.
CI builds the installers; users install once and every later release reaches
them in-app ("Update available → Restart & update").

## Architecture

```
git tag v0.2.0                      (by hand, or by the daily Auto Release job)
  → .github/workflows/release.yml
      → builds installers on GitHub runners:
          macOS  .dmg + .app.tar.gz(+.sig)     (Apple Silicon + Intel)
          Windows .exe (NSIS) / .msi (+.sig)
          Linux  .AppImage(+.sig), .deb, .rpm
      → uploads everything to a DRAFT release on this repo
      → attaches latest.json (updater manifest, minisign-signed entries)
  → published  ← this is the "ship it" moment
      Auto Release publishes it itself, once all four platforms built.
      A tag pushed by hand leaves the draft for you to publish.
      → installed apps poll
        https://github.com/Pairlens/trading-terminal/releases/latest/download/latest.json
        and offer the update in-app
```

Releases live on this repo (no separate distribution repo — the source is
being published). **The updater endpoint and installer downloads only
resolve while the repo is public**; until the repo goes public,
installed apps fail their background update checks quietly and catch up on
the first check after it does.

Update packages are signed with a minisign key (independent of OS code
signing). The app verifies every download against the pubkey pinned in
`apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), so a
compromised download host alone cannot ship malicious updates.

## One-time setup

1. **Store the updater signing key as repo secrets.** The keypair lives at
   `~/.tauri/pairlens-updater.key(.pub)` on the machine that generated it.
   **Back the private key up somewhere safe (password manager): losing it
   means existing installs can never be offered another update.**

   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY -R Pairlens/trading-terminal \
     < ~/.tauri/pairlens-updater.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R Pairlens/trading-terminal -b ""
   ```

   (Regenerate with
   `bunx @tauri-apps/cli signer generate -w ~/.tauri/pairlens-updater.key`
   — but then the pubkey in `tauri.conf.json` must be replaced and already
   shipped apps will reject updates signed with the new key.)

   Release creation and asset uploads use the workflow's built-in
   `GITHUB_TOKEN` — no PAT needed.

2. **macOS code signing + notarization** (configured 2026-08 with the
   Pairlens Apple Developer account; the cert key material lives in
   `~/.tauri/apple/`). All six secrets are required — the workflow passes
   them unconditionally, and an unset repo secret arrives as an empty
   string that breaks the Tauri bundler:
   `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY` (`Developer ID Application: <name> (<team>)`),
   `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.
   The Developer ID certificate is minted from a CSR
   (`~/.tauri/apple/pairlens-developer-id.csr`); to rotate, re-issue at
   developer.apple.com from a fresh CSR, rebuild the .p12 and reset the
   first three secrets.

3. **macOS provisioning profile** (required for the Touch ID vault
   protector). The data protection keychain — the only keychain that accepts
   the biometric access control `src-tauri/src/biometric.rs` asks for —
   refuses any process without the `com.apple.application-identifier`
   entitlement, and codesign only honours that restricted entitlement when
   the app embeds a provisioning profile authorising it. At
   [developer.apple.com](https://developer.apple.com/account/resources):
   1. **Identifiers** → register an explicit macOS App ID for
      `finance.pairlens.desktop` (no extra capabilities needed).
   2. **Profiles** → new profile → Distribution → **Developer ID** → select
      that App ID and the Developer ID Application certificate → download.
   3. Commit the downloaded file as
      `apps/desktop/src-tauri/Pairlens_DevID.provisionprofile` (profiles
      contain no secrets — every shipped app embeds its profile in plain
      sight).

   The Release workflow auto-detects the committed profile and adds
   `--config ./src-tauri/tauri.provisioned.conf.json` (entitlements + profile
   embedding). Without the profile, builds still succeed but the Touch ID
   protector reports itself unavailable — the availability probe dry-runs the
   keychain store, so the UI never offers what the build cannot finish. Note
   the profile pins the signing certificate: after rotating the Developer ID
   cert (step 2), regenerate the profile too.

4. _(Optional)_ **Windows code signing** (SmartScreen reputation): Azure
   Trusted Signing or an EV certificate — see the Tauri docs when ready; not
   wired into the workflow yet.

## Cutting a release

```bash
bun run release patch        # or minor / major / auto / 1.2.3
git push origin HEAD --follow-tags
```

Shorthands: `bun run release:patch`, `:minor`, `:major`. Add `--push` to skip
the second command (`bun run release patch --push`). `auto` picks the bump from
the conventional commits that have landed since the last tag: a `feat` or a
breaking change makes it a minor while the app is pre-1.0, anything else a
patch.

`bun run release` bumps the version in `tauri.conf.json`, `Cargo.toml`,
`Cargo.lock` and `apps/desktop/package.json` (the release workflow refuses
tags that disagree with `tauri.conf.json`), commits, and tags `v<version>`.

The tag push triggers the **Release** workflow (~20–30 min across four
runners). It produces a **draft** release with all installers plus
`latest.json`.

### The daily check

Installers only move when a tag is cut, so weeks of merged work can sit
unshipped while the download page serves an old build. `.github/workflows/auto-release.yml`
runs at 06:30 UTC every day and cuts the tag when one is overdue.

Overdue means: a change that ships **inside the app** has been on main for
7 days without reaching a release. The rules, all of them in
`scripts/release/due.ts`:

- **Age is measured from when work landed on main**, not when it was written.
  A branch whose commits are a month old but merged yesterday has been on main
  for one day.
- **Only changes that reach an installer start the clock.** Marketing site,
  registry, CLI, docs, CI config and agent files do not. A README typo should
  not spend 30 minutes on four runners.
- **The soak window is a trigger, not a cutoff.** Once a release is due,
  everything on main goes into it, yesterday's merges included.
- **The bump is inferred** the same way `bun run release auto` infers it.
  Majors stay a human decision: a breaking change on a 0.x version is a minor.

Two guards stop it from making things worse. It skips while any draft release
is still unpublished, because that human gate has not been passed yet and a
second draft would only stack. And it skips when checks on the head commit are
failing or still running, because those installers would auto-update users into
a broken build.

Either way it says so in the run summary and as a workflow warning, and tries
again the next day.

Ask the same question locally at any time:

```bash
bun run release:check              # human report
bun run release:check --json       # the whole decision as JSON
bun run release:check --soak-days 3 --bump minor
```

The workflow can also be run by hand from the Actions tab, where the inputs
override the bump, shorten the soak window, dry-run the decision, or force past
the guards.

**And it publishes.** The week on main behind a green CI run is the review; a
draft waiting for someone to notice it is the problem the job exists to solve.
Publishing happens last, after all four platforms have built and the signed
`latest.json` is attached, so a failed build leaves a draft instead of a
release with a missing installer. Uncheck **publish** on a manual dispatch to
stop at a draft.

Two consequences worth knowing. Nobody edits the release notes before they go
out, so what `scripts/release/changelog.ts` generates is what users read (you
can still edit a published release). And if a release turns out bad, unpublish
it: `gh release edit v0.6.0 --draft=true` puts `releases/latest` back on the
previous version, which stops it spreading to anyone who has not updated yet.
Then fix forward.

### Release notes

The draft arrives with its changelog already written. `scripts/release/changelog.ts`
reads every commit between the previous `v*` tag and the new one (`--no-merges`,
so a branch contributes its own commits and not the `merge:` commit that folded
it in) and groups them by conventional-commit type: `feat` under **New**, `fix`
under **Fixed**, `perf`, `polish`/`style`, `i18n`, `docs`, and everything else
(`chore`, `refactor`, `test`, `ci`, plus commits with no type at all) inside a
collapsed **Under the hood**. `release:` commits are dropped, `feat!:` and
`BREAKING CHANGE:` float to the top, and every line links its commit.

Preview the notes for a tag before pushing it, or regenerate them by hand:

```bash
bun scripts/release/changelog.ts v0.2.0
```

Reruns of a failed pipeline reuse the existing draft and leave its body alone,
so hand-edits survive a rebuild.

**Publish the draft to ship.** Hand-cut tags only; Auto Release does this
itself. Edit the release notes on the releases page, then publish (or
`gh release edit v0.2.0 --draft=false`). Publishing makes
`releases/latest/download/latest.json` resolve to the new manifest; running
apps pick it up on their next check (on launch + every 4 h, or App menu →
"Check for Updates…" on macOS).

## How updates behave for users

- The **leader window** checks 15 s after launch and every 4 hours
  (`apps/terminal/src/lib/updater.ts`).
- An available update shows a persistent toast; clicking **Restart & update**
  downloads (with progress), verifies the signature, installs, and relaunches.
  On Windows the NSIS installer runs in passive mode and restarts the app
  itself.
- Linux auto-update applies to the **AppImage** only. `.deb`/`.rpm` users
  update through their package manager / manual download (the updater plugin
  doesn't patch system-managed packages).

## Download links for the marketing site

Stable URL for the newest published release (once the repo is public):

```
https://github.com/Pairlens/trading-terminal/releases/latest
```

Individual assets are versioned by filename, so link the release page (or
resolve concrete asset URLs from `latest.json`) rather than hardcoding asset
names.

## Troubleshooting

- **Workflow fails at "Verify tag matches app version"** — the tag was created
  by hand without `bun run release`. Re-tag after bumping.
- **A platform is missing from latest.json** — its build job failed; re-run
  the failed jobs. The final `updater-manifest` job rebuilds `latest.json`
  from whatever `.sig` assets exist, so a re-run fully heals the manifest.
- **Apps report "Could not check for updates"** — the release is still a
  draft, or the repo isn't public yet.
- **Auto Release ran but cut nothing.** Read its job summary. It prints the
  baseline tag, how many unreleased commits it counted, how many of those ship
  inside the app, and the age of the oldest one. The usual answers are an
  unpublished draft, checks that are not green on main, or a week that has not
  passed yet.
- **Auto Release cut a tag but no installers built.** The build runs as a
  called workflow inside the same Auto Release run, not as a separate Release
  run. Look for the `release / build` jobs there.
- **Auto Release cut a release but left it a draft.** A build job failed, so
  the `publish` job never ran. Re-run the failed jobs; the manifest and the
  aliases heal, and publishing is then one `gh release edit --draft=false`.
- **A published release needs to be taken back.** `gh release edit <tag>
--draft=true`. `releases/latest` falls back to the previous published
  release, so new update checks stop seeing it. Anyone already updated stays
  updated, so follow it with a fix.
- **Local `tauri build` fails at "error running bundle_dmg.sh"** — the DMG
  step drives Finder via AppleScript to lay out the volume window, which
  needs an interactive session with Automation permission. Run
  `CI=true bunx tauri build` to skip the Finder styling (this is what CI
  does automatically — the release workflow is unaffected). The `.app`
  bundle itself always builds either way.
