// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The passkey protector, via the WebAuthn PRF extension.
 *
 * PRF gives us a per-credential, per-salt secret that only the authenticator
 * can compute — a platform authenticator (Touch ID, Windows Hello) or a
 * roaming USB key with hmac-secret, both through the same API. That secret is
 * the KEK input; nothing about the assertion signature is checked, because
 * there is no relying-party server here and nothing to check it against. The
 * vault's security comes from the fact that the PRF output cannot be produced
 * without the authenticator and a user-verification gesture, not from the
 * challenge round trip.
 *
 * Feature detection is deliberately conservative. `isPasskeySupported()`
 * returns false in the packaged desktop app: Tauri serves from
 * `tauri://localhost` (macOS) and `http://tauri.localhost` (Windows), neither
 * of which is a valid WebAuthn origin — while `bun run dev:desktop` runs on
 * `http://localhost:3000` and works fine. A runtime probe would therefore pass
 * in dev and fail in release, which is the worst possible place to find out.
 *
 * Everything that touches `navigator.credentials` sits behind `PasskeyPrfPort`
 * so the derivation can be tested with fixed vectors — WebAuthn cannot run
 * headless.
 */

import {
  KEK_INFO_PASSKEY,
  PASSKEY_SALT_BYTES,
  deriveKek,
  fromBase64,
  importDek,
  protectorAad,
  randomBytes,
  toBase64,
  unwrapRawDek,
  wrapDek,
  zero,
} from './vault-crypto'
import { VAULT_RECORD_VERSION, passkeyProtectors } from './vault-record'
import { VaultProtectorError } from './vault-errors'
import type { PasskeyProtector, VaultRecord } from './vault-record'
import { isStandalone } from '@/lib/platform'

/** The parts of a record a passkey operation needs, so enrollment can run before one exists. */
export type VaultIdentity = {
  /** base64, 32 bytes — the fixed PRF eval input for this vault. */
  prfSalt: string
  /** base64, 32 bytes — the stable WebAuthn user handle. */
  webauthnUserId: string
}

export type PasskeyCreateRequest = VaultIdentity & {
  userName: string
  userDisplayName: string
}

export type PasskeyCreateResult = {
  credentialId: Uint8Array<ArrayBuffer>
  transports?: Array<string>
  /** 32 bytes of PRF output. */
  prfSecret: Uint8Array<ArrayBuffer>
}

export type PasskeyAssertRequest = {
  prfSalt: string
  /** base64 credential ids of every enrolled passkey protector. */
  allowCredentialIds: Array<string>
}

export type PasskeyAssertResult = {
  credentialId: Uint8Array<ArrayBuffer>
  prfSecret: Uint8Array<ArrayBuffer>
}

export type PasskeyPrfPort = {
  create: (request: PasskeyCreateRequest) => Promise<PasskeyCreateResult>
  assert: (request: PasskeyAssertRequest) => Promise<PasskeyAssertResult>
}

/**
 * `AuthenticationExtensionsPRFValues.first` is typed `BufferSource` on the
 * output side. Narrow it rather than casting: a view over a larger buffer is
 * a real possibility and `new Uint8Array(view)` would silently copy the wrong
 * bytes if we assumed otherwise.
 */
function toBytes(value: BufferSource): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  const copy = new Uint8Array(value.byteLength)
  copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  return copy
}

function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotAllowedError'
}

// ── The real WebAuthn port ───────────────────────────────────────────

export const webAuthnPrfPort: PasskeyPrfPort = {
  async create(request) {
    let credential: PublicKeyCredential
    try {
      const created = (await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          // No `rp.id`: the browser uses the current origin's effective
          // domain. Hardcoding one breaks localhost dev and every
          // self-hosted deployment.
          rp: { name: 'Pairlens' },
          user: {
            id: fromBase64(request.webauthnUserId),
            name: request.userName,
            displayName: request.userDisplayName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'required',
            // No `authenticatorAttachment` — platform biometrics and roaming
            // USB keys both qualify.
          },
          extensions: { prf: {} },
        },
      })) as PublicKeyCredential | null
      if (created === null) {
        throw new VaultProtectorError('No passkey was created', 'cancelled')
      }
      credential = created
    } catch (err) {
      if (err instanceof VaultProtectorError) throw err
      if (isCancellation(err)) {
        throw new VaultProtectorError('Passkey prompt dismissed', 'cancelled')
      }
      throw err
    }

    if (credential.getClientExtensionResults().prf?.enabled !== true) {
      throw new VaultProtectorError(
        'This device or browser cannot derive a key from a passkey',
        'prf-unsupported',
      )
    }

    const transports = (
      credential.response as AuthenticatorAttestationResponse
    ).getTransports?.()

    // Always follow with an assertion. Several Chrome versions report
    // `prf.enabled` at create time but return no `results` there, and
    // branching on which version we are on is not a thing we can test.
    const asserted = await this.assert({
      prfSalt: request.prfSalt,
      allowCredentialIds: [toBase64(new Uint8Array(credential.rawId))],
    })

    return {
      credentialId: asserted.credentialId,
      ...(transports && transports.length > 0 ? { transports } : {}),
      prfSecret: asserted.prfSecret,
    }
  },

  async assert(request) {
    let assertion: PublicKeyCredential
    try {
      const got = (await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          // Every enrolled credential, always: a roaming USB key is often not
          // discoverable, so an empty allowlist silently fails for exactly the
          // users who bought hardware to be safer.
          allowCredentials: request.allowCredentialIds.map((id) => ({
            type: 'public-key' as const,
            id: fromBase64(id),
          })),
          userVerification: 'required',
          extensions: {
            prf: { eval: { first: fromBase64(request.prfSalt) } },
          },
        },
      })) as PublicKeyCredential | null
      if (got === null) {
        throw new VaultProtectorError('No passkey was used', 'cancelled')
      }
      assertion = got
    } catch (err) {
      if (err instanceof VaultProtectorError) throw err
      if (isCancellation(err)) {
        throw new VaultProtectorError('Passkey prompt dismissed', 'cancelled')
      }
      throw err
    }

    const first = assertion.getClientExtensionResults().prf?.results?.first
    if (!first) {
      throw new VaultProtectorError(
        'This passkey returned no key material',
        'prf-unsupported',
      )
    }
    return {
      credentialId: new Uint8Array(assertion.rawId),
      prfSecret: toBytes(first),
    }
  },
}

// ── Support probe ────────────────────────────────────────────────────

export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  // See the module note: dev-desktop would pass this and release-desktop
  // would not, so the platform decides rather than the probe.
  if (isStandalone) return false
  if (!window.isSecureContext) return false
  if (typeof PublicKeyCredential === 'undefined') return false
  try {
    // Not exhaustive — a roaming USB key works without a platform
    // authenticator — but it is the only signal available before prompting,
    // and the create() call reports PRF support for real.
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ── Derivation (the part that is testable) ───────────────────────────

export async function derivePasskeyKek(
  prfSecret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return deriveKek(prfSecret, salt, KEK_INFO_PASSKEY)
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : toBase64(randomBytes(16))
}

/** Fresh identity material for a brand new vault. */
export function newVaultIdentity(): VaultIdentity {
  return {
    prfSalt: toBase64(randomBytes(PASSKEY_SALT_BYTES)),
    webauthnUserId: toBase64(randomBytes(32)),
  }
}

export async function enrollPasskeyProtector(
  identity: VaultIdentity,
  rawDek: Uint8Array<ArrayBuffer>,
  opts: {
    label: string
    userName: string
    userDisplayName: string
  },
  port: PasskeyPrfPort = webAuthnPrfPort,
): Promise<PasskeyProtector> {
  const created = await port.create({
    prfSalt: identity.prfSalt,
    webauthnUserId: identity.webauthnUserId,
    userName: opts.userName,
    userDisplayName: opts.userDisplayName,
  })
  try {
    const salt = randomBytes(PASSKEY_SALT_BYTES)
    const kek = await derivePasskeyKek(created.prfSecret, salt)
    const id = newId()
    const aad = protectorAad(VAULT_RECORD_VERSION, { id, type: 'passkey' })
    const { iv, wrapped } = await wrapDek(kek, rawDek, aad)
    return {
      id,
      type: 'passkey',
      createdAt: Date.now(),
      label: opts.label,
      credentialId: toBase64(created.credentialId),
      ...(created.transports && created.transports.length > 0
        ? { transports: created.transports }
        : {}),
      salt: toBase64(salt),
      iv: toBase64(iv),
      wrapped: toBase64(wrapped),
    }
  } finally {
    zero(created.prfSecret)
  }
}

/** Caller MUST zeroize the returned bytes. */
export async function recoverRawDekWithPasskey(
  record: VaultRecord,
  port: PasskeyPrfPort = webAuthnPrfPort,
): Promise<Uint8Array<ArrayBuffer>> {
  const candidates = passkeyProtectors(record)
  if (candidates.length === 0) {
    throw new VaultProtectorError(
      'No passkey is enrolled on this vault',
      'unavailable',
    )
  }
  const asserted = await port.assert({
    prfSalt: record.prfSalt,
    allowCredentialIds: candidates.map((p) => p.credentialId),
  })
  try {
    const used = toBase64(asserted.credentialId)
    const protector = candidates.find((p) => p.credentialId === used)
    if (!protector) {
      throw new VaultProtectorError(
        'That passkey is not enrolled on this vault',
        'no-match',
      )
    }
    const kek = await derivePasskeyKek(
      asserted.prfSecret,
      fromBase64(protector.salt),
    )
    try {
      return await unwrapRawDek(
        kek,
        fromBase64(protector.iv),
        fromBase64(protector.wrapped),
        protectorAad(VAULT_RECORD_VERSION, protector),
      )
    } catch {
      // The credential matched but its blob did not open: the record was
      // tampered with, or the authenticator changed its PRF output. Either
      // way this passkey is not a way in any more.
      throw new VaultProtectorError(
        'That passkey could not open the vault',
        'no-match',
      )
    }
  } finally {
    zero(asserted.prfSecret)
  }
}

export async function unlockWithPasskey(
  record: VaultRecord,
  port: PasskeyPrfPort = webAuthnPrfPort,
): Promise<CryptoKey> {
  const raw = await recoverRawDekWithPasskey(record, port)
  try {
    return await importDek(raw)
  } finally {
    zero(raw)
  }
}
