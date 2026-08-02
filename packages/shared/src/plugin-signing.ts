// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Plugin artifact signing — detached Ed25519 signatures over a canonical
 * payload that binds plugin identity, version, and content hashes.
 *
 * The signature is computed by the publisher (registry tooling) and verified
 * by the terminal against pinned publisher public keys before a registry
 * module is ever evaluated. Because the payload includes the pluginId,
 * version, and SHA-256 of the module (and stylesheet), a compromised registry
 * cannot swap module URLs, downgrade versions, or re-point integrity hashes.
 *
 * Uses WebCrypto Ed25519 — available in the browsers we target, Bun, and
 * Node ≥ 20. Dependency-free so it runs in the terminal, registry, and CLI.
 */

export const PLUGIN_SIGNING_DOMAIN = 'pairlens-plugin-v1'

export type PluginSigningInput = {
  pluginId: string
  version: string
  moduleText: string
  styleText?: string | null
}

export type PluginSignature = {
  /** base64 Ed25519 signature over the canonical payload */
  signature: string
  /** identifies which pinned publisher key verifies this signature */
  publisherKeyId: string
}

// ── Hashing ─────────────────────────────────────────────────────────

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Canonical signed statement. Any change to this format is a breaking
 * protocol change — bump PLUGIN_SIGNING_DOMAIN if the layout ever changes.
 */
export async function buildSigningPayload(
  input: PluginSigningInput,
): Promise<string> {
  const moduleHash = await sha256Hex(input.moduleText)
  const styleHash = input.styleText ? await sha256Hex(input.styleText) : '-'
  return [
    PLUGIN_SIGNING_DOMAIN,
    input.pluginId,
    input.version,
    moduleHash,
    styleHash,
  ].join('\n')
}

// ── base64 helpers (browser + Bun, no Buffer) ───────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Keys ────────────────────────────────────────────────────────────

/** Import a base64-encoded raw (32-byte) Ed25519 public key. */
export async function importPublisherPublicKey(
  publicKeyB64: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(publicKeyB64) as BufferSource,
    { name: 'Ed25519' },
    false,
    ['verify'],
  )
}

/** Import a base64-encoded PKCS#8 Ed25519 private key (publisher side). */
export async function importPublisherPrivateKey(
  privateKeyPkcs8B64: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyPkcs8B64) as BufferSource,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
}

/**
 * Generate a publisher keypair. Returns base64: raw public key + PKCS#8
 * private key. Used by registry tooling and tests — never by the terminal.
 */
export async function generatePublisherKeypair(): Promise<{
  publicKeyB64: string
  privateKeyPkcs8B64: string
}> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])
  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  const privatePkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', pair.privateKey),
  )
  return {
    publicKeyB64: bytesToBase64(publicRaw),
    privateKeyPkcs8B64: bytesToBase64(privatePkcs8),
  }
}

// ── Sign / Verify ───────────────────────────────────────────────────

export async function signPluginArtifact(
  input: PluginSigningInput,
  privateKeyPkcs8B64: string,
  publisherKeyId: string,
): Promise<PluginSignature> {
  const key = await importPublisherPrivateKey(privateKeyPkcs8B64)
  const payload = await buildSigningPayload(input)
  const sig = await crypto.subtle.sign(
    'Ed25519',
    key,
    new TextEncoder().encode(payload),
  )
  return {
    signature: bytesToBase64(new Uint8Array(sig)),
    publisherKeyId,
  }
}

/**
 * Verify a detached plugin signature against a single public key.
 * Returns false on any failure (bad key, bad base64, mismatch) — never throws.
 */
export async function verifyPluginSignature(
  input: PluginSigningInput,
  signatureB64: string,
  publicKeyB64: string,
): Promise<boolean> {
  try {
    const key = await importPublisherPublicKey(publicKeyB64)
    const payload = await buildSigningPayload(input)
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      base64ToBytes(signatureB64) as BufferSource,
      new TextEncoder().encode(payload),
    )
  } catch {
    return false
  }
}
