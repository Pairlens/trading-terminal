// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Biometric unlock for the terminal lock — Face ID, Touch ID, an Android
 * fingerprint or face unlock, Windows Hello.
 *
 * This is the phone's story above all. On a laptop, typing a password to get
 * past a screen lock is a two-second tax; on a phone, where the same lock fires
 * on every cold start and every idle timeout, it is the reason people turn the
 * lock off. So the phone gets the door it expects.
 *
 * WHAT IT IS, precisely: a WebAuthn credential on the platform authenticator,
 * asserted with `userVerification: 'required'`. The assertion is proof that the
 * device's own owner-verification just succeeded — the same gesture that opens
 * the phone. Nothing about the signature is verified, because there is no
 * relying party here and nothing to verify it against; what the browser
 * guarantees is that the assertion cannot be produced without the
 * authenticator AND a user-verification gesture, and that is the whole of the
 * claim being made.
 *
 * WHAT IT IS NOT — the line this module must never cross: it does not open the
 * credential vault. The lock gates a screen; the vault gates the keys, and it
 * gates them with a key wrapped under a real secret (a password, or a passkey's
 * PRF output). This credential derives nothing, so it cannot unwrap anything,
 * and a design where it could would mean the vault's data key was reachable
 * from a stored credential id. A user with a vault therefore still answers the
 * vault's own prompt — that is `vault-sealed-banner.tsx`'s job, not this one's.
 * Users who want one gesture for both want a vault PASSKEY protector
 * (`vault-passkey.ts`), which the Security panel points at.
 *
 * Its strength is therefore exactly the lock verifier's strength, and it
 * inherits the same honest caveat (see lock-verifier.ts): in a browser the
 * record's INTEGRITY is unprotected, so someone who can edit the profile on
 * disk can plant a credential id they control and walk past the lock screen.
 * They still get ciphertext where the keys are. The rule that keeps this true
 * is `hasLockBiometric()` never being consulted for anything but the screen.
 *
 * `navigator.credentials` sits behind `LockBiometricPort` because WebAuthn
 * cannot run headless, and the part worth testing — that an assertion for a
 * credential we did not enroll is refused — is the part that would otherwise
 * be untestable.
 */

import { LOCK_BIOMETRIC_KEY } from './keys'
import { onLockMessage, postLock } from './lock-channel'
import { fromBase64, randomBytes, toBase64 } from './vault/vault-crypto'
import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'
import { isStandalone } from '@/lib/platform'

export { LOCK_BIOMETRIC_KEY }

/**
 * What is stored. A credential id and a label — no key material, because
 * there is none on this side of the authenticator.
 */
export type LockBiometricRecord = {
  v: 1
  /** base64 of the credential's raw id. */
  credentialId: string
  /** Hints the browser uses to find the authenticator faster. */
  transports?: Array<string>
  label: string
  createdAt: number
}

export type LockBiometricResult =
  | 'ok'
  /** The prompt was dismissed. Not a failed guess — never counts against the backoff. */
  | 'cancelled'
  /** Nothing enrolled, or the record is unreadable. The caller falls back to the password. */
  | 'missing'
  /** An assertion arrived for a credential this device did not enroll. Fail closed. */
  | 'no-match'
  /** The authenticator refused for a reason a retry will not fix. */
  | 'unavailable'

// ── The real WebAuthn port ───────────────────────────────────────────

export type LockBiometricCreateRequest = {
  /** base64, 32 bytes — a stable WebAuthn user handle for this install. */
  userId: string
  userName: string
  userDisplayName: string
}

export type LockBiometricPort = {
  create: (request: LockBiometricCreateRequest) => Promise<{
    credentialId: Uint8Array<ArrayBuffer>
    transports?: Array<string>
  }>
  assert: (request: { allowCredentialIds: Array<string> }) => Promise<{
    credentialId: Uint8Array<ArrayBuffer>
  }>
}

/** A dismissed prompt and a timeout both surface as `NotAllowedError`. */
function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotAllowedError'
}

export const webAuthnLockPort: LockBiometricPort = {
  async create(request) {
    const created = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        // No `rp.id` — the browser uses the current origin's effective domain.
        // Hardcoding one breaks localhost dev and every self-hosted install.
        rp: { name: 'Pairlens' },
        user: {
          id: fromBase64(request.userId),
          name: request.userName,
          displayName: request.userDisplayName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          // `platform`, unlike the vault's passkey protector, which happily
          // takes a roaming USB key: this door exists so the phone in the
          // user's hand opens its own lock screen. A security key that has to
          // be plugged in is not that, and offering it here would produce a
          // "biometric unlock" that prompts for hardware nobody carries.
          authenticatorAttachment: 'platform',
          // Discoverable credentials cost a slot on some authenticators and buy
          // nothing here — we always know which id to ask for.
          residentKey: 'discouraged',
          // The entire security claim. Without it the assertion proves only
          // that the device was present, which is not a lock.
          userVerification: 'required',
        },
      },
    })) as PublicKeyCredential | null
    if (created === null) {
      throw new LockBiometricError('No credential was created', 'cancelled')
    }
    const transports = (
      created.response as AuthenticatorAttestationResponse
    ).getTransports?.()
    return {
      credentialId: new Uint8Array(created.rawId),
      ...(transports && transports.length > 0 ? { transports } : {}),
    }
  },

  async assert(request) {
    const asserted = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: request.allowCredentialIds.map((id) => ({
          type: 'public-key' as const,
          id: fromBase64(id),
        })),
        userVerification: 'required',
      },
    })) as PublicKeyCredential | null
    if (asserted === null) {
      throw new LockBiometricError('No credential was used', 'cancelled')
    }
    return { credentialId: new Uint8Array(asserted.rawId) }
  },
}

/** Carries the outcome the UI branches on, rather than a bare message. */
export class LockBiometricError extends Error {
  readonly kind: Exclude<LockBiometricResult, 'ok'>

  constructor(message: string, kind: Exclude<LockBiometricResult, 'ok'>) {
    super(message)
    this.name = 'LockBiometricError'
    this.kind = kind
  }
}

// ── Support probe ────────────────────────────────────────────────────

/**
 * Whether to OFFER the toggle.
 *
 * False in the packaged desktop app, for the reason `isPasskeySupported()`
 * gives at length: Tauri serves from `tauri://localhost`, which is not a valid
 * WebAuthn origin, while `bun run dev:desktop` serves from
 * `http://localhost:3000` and works fine — so a runtime probe would pass in dev
 * and fail in release. Desktop has Touch ID through `vault-biometric.ts`
 * instead, which goes through the OS keychain rather than WebAuthn.
 *
 * `isUserVerifyingPlatformAuthenticatorAvailable` is the right question here
 * even though the passkey protector treats it as merely a hint: this door is
 * platform-only by construction, so a device with no platform authenticator has
 * nothing to offer.
 */
export async function isLockBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (isStandalone) return false
  if (!window.isSecureContext) return false
  if (typeof PublicKeyCredential === 'undefined') return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ── Storage ──────────────────────────────────────────────────────────

/** Strict parse — a record we cannot read is a record that is not there. */
export function parseLockBiometric(
  raw: string | null,
): LockBiometricRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LockBiometricRecord>
    if (parsed.v !== 1) return null
    if (typeof parsed.credentialId !== 'string' || !parsed.credentialId) {
      return null
    }
    const transports = Array.isArray(parsed.transports)
      ? parsed.transports.filter((t): t is string => typeof t === 'string')
      : undefined
    return {
      v: 1,
      credentialId: parsed.credentialId,
      ...(transports && transports.length > 0 ? { transports } : {}),
      label: typeof parsed.label === 'string' ? parsed.label : '',
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
    }
  } catch {
    return null
  }
}

export async function loadLockBiometric(): Promise<LockBiometricRecord | null> {
  return parseLockBiometric(await getCredential(LOCK_BIOMETRIC_KEY))
}

// ── Enroll / verify / remove ─────────────────────────────────────────

/**
 * Create the credential and remember its id.
 *
 * The keychain write comes last: a record that names a credential the
 * authenticator never made would put a button on the lock screen that raises a
 * prompt no finger can answer, and the only way out of that is the destructive
 * reset. The other order — credential first, record second — leaves at worst an
 * unreferenced credential in the user's password manager, which they can delete
 * and which costs them nothing.
 */
export async function enrollLockBiometric(
  opts: { label: string; userName: string; userDisplayName: string },
  port: LockBiometricPort = webAuthnLockPort,
): Promise<LockBiometricRecord> {
  let created: Awaited<ReturnType<LockBiometricPort['create']>>
  try {
    created = await port.create({
      userId: toBase64(randomBytes(32)),
      userName: opts.userName,
      userDisplayName: opts.userDisplayName,
    })
  } catch (err) {
    throw toLockBiometricError(err)
  }
  const record: LockBiometricRecord = {
    v: 1,
    credentialId: toBase64(created.credentialId),
    ...(created.transports && created.transports.length > 0
      ? { transports: created.transports }
      : {}),
    label: opts.label,
    createdAt: Date.now(),
  }
  await saveCredential(LOCK_BIOMETRIC_KEY, JSON.stringify(record))
  setEnrolled(true, true)
  return record
}

/**
 * Raise the prompt and decide whether it opened the screen.
 *
 * The credential-id comparison is the whole check. `allowCredentials` already
 * confines the browser to the enrolled id, so a mismatch should be impossible —
 * which is exactly why it is worth asserting: if it ever becomes possible, the
 * failure is silent and it is a bypass.
 */
export async function verifyLockBiometric(
  port: LockBiometricPort = webAuthnLockPort,
): Promise<LockBiometricResult> {
  const record = await loadLockBiometric()
  if (!record) return 'missing'
  try {
    const asserted = await port.assert({
      allowCredentialIds: [record.credentialId],
    })
    return toBase64(asserted.credentialId) === record.credentialId
      ? 'ok'
      : 'no-match'
  } catch (err) {
    return toLockBiometricError(err).kind
  }
}

/**
 * Forget the credential.
 *
 * A keychain that refuses the delete still propagates — the caller has an
 * error to show — but the flag drops either way, in a `finally`: a toggle stuck
 * ON over a door the user just turned off is the one outcome that reads as a
 * lie about the state of their security settings.
 *
 * The credential itself stays in the user's password manager / platform
 * authenticator: WebAuthn gives a relying party no way to delete one, and
 * pretending otherwise in the copy would be a lie of a different kind. It opens
 * nothing once this record is gone.
 */
export async function clearLockBiometric(): Promise<void> {
  try {
    await deleteCredential(LOCK_BIOMETRIC_KEY)
  } finally {
    setEnrolled(false, true)
  }
}

/**
 * Did the user simply dismiss the prompt?
 *
 * A predicate rather than an `instanceof` at each call site: the class lives
 * behind a dynamic import, so callers reaching it from a `catch` would have to
 * either hoist the import or sniff `err.name` — and the second one quietly
 * matches `VaultProtectorError`, which also carries a `kind: 'cancelled'`.
 */
export function isLockBiometricCancellation(err: unknown): boolean {
  return err instanceof LockBiometricError && err.kind === 'cancelled'
}

function toLockBiometricError(err: unknown): LockBiometricError {
  if (err instanceof LockBiometricError) return err
  if (isCancellation(err)) {
    return new LockBiometricError('The prompt was dismissed', 'cancelled')
  }
  return new LockBiometricError(
    err instanceof Error ? err.message : String(err),
    'unavailable',
  )
}

// ── Live "is it enrolled?" ───────────────────────────────────────────

/**
 * The lock overlay has to know whether to draw the button before anyone
 * touches anything, and it must not read the keychain on every render — on
 * desktop that is an IPC round trip.
 *
 * Cached at module level with an explicit refresh, the same shape
 * `vault-session` uses. `null` means "not asked yet", which the UI renders as
 * "no button" rather than flashing one in and out.
 */
let enrolled: boolean | null = null
let probing: Promise<boolean> | null = null
let bridged = false
const listeners = new Set<() => void>()

function setEnrolled(next: boolean, broadcast = false): void {
  if (enrolled === next) return
  enrolled = next
  for (const listener of [...listeners]) listener()
  if (broadcast) postLock({ type: 'lock-biometric', enrolled: next })
}

/** Sibling windows learn about an enrollment without re-reading the keychain. */
function ensureBridge(): void {
  if (bridged || typeof window === 'undefined') return
  bridged = true
  onLockMessage((message) => {
    if (message.type === 'lock-biometric') setEnrolled(message.enrolled)
  })
}

export function getLockBiometricEnrolled(): boolean {
  return enrolled === true
}

export function subscribeLockBiometric(listener: () => void): () => void {
  ensureBridge()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Read the keychain once and publish the answer.
 *
 * A keychain that throws answers `false`: the fallback is the password field
 * that is already on screen, and a button that cannot find its own record would
 * only raise a prompt and then refuse.
 */
export async function refreshLockBiometric(): Promise<boolean> {
  ensureBridge()
  probing ??= loadLockBiometric()
    .then((record) => record !== null)
    .catch(() => false)
    .finally(() => {
      probing = null
    })
  const next = await probing
  setEnrolled(next)
  return next
}
