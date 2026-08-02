// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Registry-side artifact signing.
 *
 * At startup the registry signs each locally-served plugin module (and its
 * optional stylesheet) with a publisher private key, producing the detached
 * Ed25519 signature + content hash the terminal requires before it will
 * install a registry plugin. Signing the ACTUAL bytes served — rather than
 * trusting hand-maintained catalog fields — means the catalog can't drift out
 * of sync with what's on disk.
 *
 * Key sources (first found wins), one keypair per tier:
 *
 *   Official entries:
 *   1. REGISTRY_SIGNING_KEY            — base64 PKCS#8 Ed25519 private key
 *   2. REGISTRY_SIGNING_KEY_FILE       — path to a file containing the above
 *   3. apps/registry/keys/dev-publisher.key  — committed DEV key (dev only)
 *
 *   Community entries (tier: 'community') use a SEPARATE key so terminals can
 *   attach the sandbox-only restriction to the key that verified the bytes:
 *   1. REGISTRY_COMMUNITY_SIGNING_KEY
 *   2. REGISTRY_COMMUNITY_SIGNING_KEY_FILE
 *   3. apps/registry/keys/dev-community.key  — committed DEV key (dev only)
 *
 * Key ids default to REGISTRY_SIGNING_KEY_ID / REGISTRY_COMMUNITY_SIGNING_KEY_ID
 * or the respective dev key id. A missing key leaves that tier unsigned —
 * terminals refuse unsigned entries, so the failure mode is "no install".
 */
import { sha256Hex, signPluginArtifact } from '@pairlens/shared/plugin-signing'
import {
  DEV_COMMUNITY_PUBLISHER_KEY_ID,
  DEV_PUBLISHER_KEY_ID,
} from '@pairlens/shared/publisher-keys'

import { fullCatalog } from './community'
import type { PluginSignature } from '@pairlens/shared/plugin-signing'

export type ArtifactSignature = PluginSignature & { moduleHash: string }

const signatureByPluginId = new Map<string, ArtifactSignature>()

type SigningKey = { keyB64: string; keyId: string }

async function resolveKey(env: {
  inlineVar: string
  fileVar: string
  idVar: string
  devKeyFile: string
  devKeyId: string
}): Promise<SigningKey | null> {
  const inline = process.env[env.inlineVar]
  if (inline) {
    return {
      keyB64: inline.trim(),
      keyId: process.env[env.idVar] ?? env.devKeyId,
    }
  }

  const filePath =
    process.env[env.fileVar] ??
    new URL(`../keys/${env.devKeyFile}`, import.meta.url).pathname
  try {
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const keyB64 = (await file.text()).trim()
      if (keyB64) {
        return { keyB64, keyId: process.env[env.idVar] ?? env.devKeyId }
      }
    }
  } catch {
    // fall through
  }
  return null
}

function resolveOfficialKey(): Promise<SigningKey | null> {
  return resolveKey({
    inlineVar: 'REGISTRY_SIGNING_KEY',
    fileVar: 'REGISTRY_SIGNING_KEY_FILE',
    idVar: 'REGISTRY_SIGNING_KEY_ID',
    devKeyFile: 'dev-publisher.key',
    devKeyId: DEV_PUBLISHER_KEY_ID,
  })
}

function resolveCommunityKey(): Promise<SigningKey | null> {
  return resolveKey({
    inlineVar: 'REGISTRY_COMMUNITY_SIGNING_KEY',
    fileVar: 'REGISTRY_COMMUNITY_SIGNING_KEY_FILE',
    idVar: 'REGISTRY_COMMUNITY_SIGNING_KEY_ID',
    devKeyFile: 'dev-community.key',
    devKeyId: DEV_COMMUNITY_PUBLISHER_KEY_ID,
  })
}

async function readLocalArtifact(
  moduleUrl: string | undefined,
): Promise<string | null> {
  if (!moduleUrl || !moduleUrl.startsWith('/static/')) return null
  try {
    const filePath = new URL(`..${moduleUrl}`, import.meta.url).pathname
    const file = Bun.file(filePath)
    if (await file.exists()) return await file.text()
  } catch {
    // fall through
  }
  return null
}

/**
 * Sign every catalog entry that has a locally-served module. Call once at
 * startup. Non-fatal: entries that can't be signed simply won't carry a
 * signature (and the terminal will refuse them, as intended).
 */
export async function initSignatures(): Promise<void> {
  const officialKey = await resolveOfficialKey()
  const communityKey = await resolveCommunityKey()
  if (!officialKey && !communityKey) {
    console.warn(
      '[registry] No signing key available — locally-served plugins will be unsigned and rejected by the terminal.',
    )
    return
  }

  for (const entry of fullCatalog()) {
    const key = entry.tier === 'community' ? communityKey : officialKey
    if (!key) {
      console.warn(
        `[registry] No ${entry.tier ?? 'official'} signing key — '${entry.manifest.id}' will be unsigned and rejected by the terminal.`,
      )
      continue
    }
    const moduleText = await readLocalArtifact(entry.moduleUrl)
    if (moduleText === null) continue
    const styleText = await readLocalArtifact(entry.styleUrl)
    try {
      const sig = await signPluginArtifact(
        {
          pluginId: entry.manifest.id,
          version: entry.manifest.version,
          moduleText,
          styleText,
        },
        key.keyB64,
        key.keyId,
      )
      signatureByPluginId.set(entry.manifest.id, {
        ...sig,
        moduleHash: await sha256Hex(moduleText),
      })
    } catch (err) {
      console.warn(
        `[registry] Failed to sign '${entry.manifest.id}':`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  console.info(
    `[registry] Signed ${signatureByPluginId.size} local plugin module(s) (official key '${
      officialKey?.keyId ?? 'none'
    }', community key '${communityKey?.keyId ?? 'none'}').`,
  )
}

/** Merge the computed signature fields into an entry before it is served. */
export function withSignature<
  T extends { manifest: { id: string }; moduleUrl?: string },
>(entry: T): T {
  const sig = signatureByPluginId.get(entry.manifest.id)
  if (!sig) return entry
  return {
    ...entry,
    signature: sig.signature,
    publisherKeyId: sig.publisherKeyId,
    moduleHash: sig.moduleHash,
  }
}
