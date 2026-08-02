# Releasing Pairlens Desktop

Pairlens ships as a Tauri desktop app with Spotify/Figma-style auto-updates.
CI builds the installers; users install once and every later release reaches
them in-app ("Update available → Restart & update").

## Architecture

```
git tag v0.2.0
  → .github/workflows/release.yml
      → builds installers on GitHub runners:
          macOS  .dmg + .app.tar.gz(+.sig)     (Apple Silicon + Intel)
          Windows .exe (NSIS) / .msi (+.sig)
          Linux  .AppImage(+.sig), .deb, .rpm
      → uploads everything to a DRAFT release on this repo
      → attaches latest.json (updater manifest, minisign-signed entries)
  → human publishes the draft  ← this is the "ship it" button
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

3. _(Optional)_ **Windows code signing** (SmartScreen reputation): Azure
   Trusted Signing or an EV certificate — see the Tauri docs when ready; not
   wired into the workflow yet.

## Cutting a release

```bash
bun run release patch        # or minor / major / 1.2.3
git push origin HEAD --follow-tags
```

`bun run release` bumps the version in `tauri.conf.json`, `Cargo.toml`,
`Cargo.lock` and `apps/desktop/package.json` (the release workflow refuses
tags that disagree with `tauri.conf.json`), commits, and tags `v<version>`.

The tag push triggers the **Release** workflow (~20–30 min across four
runners). It produces a **draft** release with all installers plus
`latest.json`.

**Publish the draft to ship** — edit the release notes on the releases page,
then publish (or `gh release edit v0.2.0 --draft=false`). Publishing makes
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
- **Local `tauri build` fails at "error running bundle_dmg.sh"** — the DMG
  step drives Finder via AppleScript to lay out the volume window, which
  needs an interactive session with Automation permission. Run
  `CI=true bunx tauri build` to skip the Finder styling (this is what CI
  does automatically — the release workflow is unaffected). The `.app`
  bundle itself always builds either way.
