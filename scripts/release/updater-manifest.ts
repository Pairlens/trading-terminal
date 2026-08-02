// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Builds the Tauri updater manifest (latest.json) for a release and attaches
 * it as a release asset.
 *
 * Runs as the last job of .github/workflows/release.yml, after every platform
 * build has uploaded its installer + updater artifact (.tar.gz/.AppImage/.exe
 * with a matching minisign .sig). Rebuilding the manifest from the final asset
 * list in one place is deterministic — the per-build merge that tauri-action
 * does can drop platforms when jobs finish concurrently.
 *
 * The desktop app polls this file via the endpoint configured in
 * apps/desktop/src-tauri/tauri.conf.json (plugins.updater.endpoints).
 *
 * Env:
 *   GITHUB_TOKEN   token with contents:write on RELEASE_REPO
 *   RELEASE_REPO   owner/repo the release lives in (public releases repo)
 *   RELEASE_ID     numeric release id (draft or published)
 *   TAG            release tag, e.g. v0.2.0
 */

const token = requireEnv('GITHUB_TOKEN')
const releaseRepo = requireEnv('RELEASE_REPO')
const releaseId = requireEnv('RELEASE_ID')
const tag = requireEnv('TAG')

const API = 'https://api.github.com'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[updater-manifest] Missing env var: ${name}`)
    process.exit(1)
  }
  return value
}

async function gh(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(
      `GitHub API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`,
    )
  }
  return res
}

interface ReleaseAsset {
  id: number
  name: string
  url: string
}

/**
 * Download a release asset's raw bytes. Draft release assets are only
 * reachable through the API asset URL with `Accept: application/octet-stream`,
 * which 302s to short-lived storage — the Authorization header must NOT be
 * forwarded to the redirect target or storage rejects the request.
 */
async function downloadAsset(asset: ReleaseAsset): Promise<string> {
  const res = await fetch(asset.url, {
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/octet-stream',
    },
  })
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location')
    if (!location)
      throw new Error(`Redirect without location for ${asset.name}`)
    const follow = await fetch(location)
    if (!follow.ok) {
      throw new Error(
        `Asset download failed for ${asset.name}: ${follow.status}`,
      )
    }
    return follow.text()
  }
  if (!res.ok) {
    throw new Error(`Asset download failed for ${asset.name}: ${res.status}`)
  }
  return res.text()
}

/** Map an updater artifact filename to a Tauri updater platform key. */
function platformKey(name: string): string | null {
  const arch = /aarch64|arm64/i.test(name) ? 'aarch64' : 'x86_64'
  if (name.endsWith('.app.tar.gz')) return `darwin-${arch}`
  if (name.endsWith('.AppImage')) return `linux-${arch}`
  if (name.endsWith('.exe')) return `windows-${arch}`
  if (name.endsWith('.msi')) return `windows-${arch}`
  return null
}

/** NSIS (.exe) gives a smoother passive update than MSI — prefer it. */
function priority(name: string): number {
  return name.endsWith('.msi') ? 0 : 1
}

const release = (await (
  await gh(`/repos/${releaseRepo}/releases/${releaseId}`)
).json()) as { assets: Array<ReleaseAsset> }

const byPlatform = new Map<
  string,
  { assetName: string; sig: ReleaseAsset; priority: number }
>()

for (const asset of release.assets) {
  if (!asset.name.endsWith('.sig')) continue
  const artifactName = asset.name.slice(0, -'.sig'.length)
  const key = platformKey(artifactName)
  if (!key) {
    console.warn(
      `[updater-manifest] Unrecognized updater artifact: ${artifactName}`,
    )
    continue
  }
  const existing = byPlatform.get(key)
  if (existing && existing.priority >= priority(artifactName)) continue
  byPlatform.set(key, {
    assetName: artifactName,
    sig: asset,
    priority: priority(artifactName),
  })
}

if (byPlatform.size === 0) {
  console.error(
    '[updater-manifest] No updater artifacts (.sig) found on the release',
  )
  process.exit(1)
}

const platforms: Record<string, { signature: string; url: string }> = {}
for (const [key, entry] of [...byPlatform.entries()].sort()) {
  const signature = (await downloadAsset(entry.sig)).trim()
  // Deterministic public download URL — valid once the release is published.
  const url = `https://github.com/${releaseRepo}/releases/download/${tag}/${encodeURIComponent(entry.assetName)}`
  platforms[key] = { signature, url }
  console.log(`[updater-manifest] ${key} → ${entry.assetName}`)
}

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: `Pairlens ${tag} — https://github.com/${releaseRepo}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
}

// Replace any existing latest.json (reruns, or tauri-action's own merge).
const stale = release.assets.find((asset) => asset.name === 'latest.json')
if (stale) {
  await gh(`/repos/${releaseRepo}/releases/assets/${stale.id}`, {
    method: 'DELETE',
  })
}

await gh(
  `https://uploads.github.com/repos/${releaseRepo}/releases/${releaseId}/assets?name=latest.json`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest, null, 2),
  },
)

console.log(
  `[updater-manifest] latest.json attached (${byPlatform.size} platforms) for ${tag}`,
)
