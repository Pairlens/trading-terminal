// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The biometric protector — Touch ID on macOS, via the OS keychain.
 *
 * Why this exists at all: `isPasskeySupported()` is false in the packaged
 * desktop app, because Tauri serves from `tauri://localhost` and that is not a
 * valid WebAuthn origin. So the one platform with biometric hardware sitting
 * under the user's finger is the one platform where the passkey protector
 * cannot run. This closes that gap without going through WebAuthn at all.
 *
 * The shape is the same as every other protector and deliberately so: 32 bytes
 * of key material come from somewhere only the user can reach, HKDF turns them
 * into a KEK under a per-protector salt, and the KEK wraps the same DEK. Here
 * "somewhere only the user can reach" is a keychain item created with
 * `kSecAccessControlBiometryCurrentSet` (apps/desktop/src-tauri/src/biometric.rs)
 * — reading it raises the native prompt, and re-enrolling a fingerprint on the
 * Mac should invalidate it. "Should" is deliberate: the item lives in the macOS
 * file-based keychain, where that constraint is what we ASK for rather than
 * something the add call proves, so the invalidation promise is the OS's to
 * keep and manual QA's to check (see the biometric.rs header).
 *
 * THE TRADEOFF, stated rather than left implicit: the KEK crosses the Tauri IPC
 * boundary as base64 and lives in a JS string until the wrap/unwrap finishes. A
 * JS string cannot be wiped. That is the same exposure the DEK itself already
 * has in this process, and the alternative (doing the AES-GCM wrap in Rust)
 * would move the vault's crypto out of the one place it is tested. Accepted,
 * deliberately.
 *
 * Everything that touches the bridge sits behind `BiometricPort` so the
 * derivation, the error mapping and the AAD binding can be tested headlessly —
 * a real Touch ID prompt cannot be, which is what MANUAL-QA.md is for.
 */

import {
  BIOMETRIC_SALT_BYTES,
  KEK_INFO_BIOMETRIC,
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
import { VAULT_RECORD_VERSION, biometricProtectors } from './vault-record'
import { VaultProtectorError } from './vault-errors'
import type { BiometricProtector, VaultRecord } from './vault-record'
import { isStandalone } from '@/lib/platform'

export type BiometricAvailability =
  | { available: true; kind: 'touch-id' }
  | { available: false; reason: 'platform' | 'no-hardware' | 'unknown' }

export type BiometricPort = {
  probe: () => Promise<BiometricAvailability>
  /**
   * Generate the KEK, store it behind the biometric gate, and return the 32
   * raw bytes ONCE. Every later read costs a gesture.
   */
  create: (account: string, label: string) => Promise<Uint8Array<ArrayBuffer>>
  /** Raises the native prompt. */
  read: (account: string, reason: string) => Promise<Uint8Array<ArrayBuffer>>
  remove: (account: string) => Promise<void>
}

// ── The real Tauri port ──────────────────────────────────────────────

/**
 * Rust reports failures as `"<kind>: <detail>"`. The kinds are a closed set
 * (biometric.rs `kind_for`), and anything unrecognised falls through as a
 * generic failure rather than being absorbed into a state the UI treats as
 * benign.
 */
function toProtectorError(err: unknown): VaultProtectorError {
  const message = err instanceof Error ? err.message : String(err)
  const kind = message.split(':', 1)[0]?.trim()
  switch (kind) {
    case 'cancelled':
      return new VaultProtectorError('The prompt was dismissed', 'cancelled')
    case 'invalidated':
      return new VaultProtectorError(
        'This device can no longer unlock the vault with biometrics',
        'invalidated',
      )
    case 'unavailable':
      return new VaultProtectorError(
        'Biometric unlock is not available on this device',
        'unavailable',
      )
    default:
      return new VaultProtectorError(message, 'unavailable')
  }
}

async function bridge(): Promise<
  <T>(command: string, args?: Record<string, unknown>) => Promise<T>
> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke as <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<T>
}

export const tauriBiometricPort: BiometricPort = {
  async probe() {
    if (!isStandalone) return { available: false, reason: 'platform' }
    try {
      const invoke = await bridge()
      const ok = await invoke<boolean>('biometric_available')
      return ok
        ? { available: true, kind: 'touch-id' }
        : { available: false, reason: 'no-hardware' }
    } catch {
      // An older desktop build with no such command, or an IPC failure.
      // Answering "unavailable" hides a button; answering "available" would
      // offer one that throws when pressed.
      return { available: false, reason: 'unknown' }
    }
  },

  async create(account, label) {
    try {
      const invoke = await bridge()
      return fromBase64(
        await invoke<string>('biometric_create', { account, label }),
      )
    } catch (err) {
      throw toProtectorError(err)
    }
  },

  async read(account, reason) {
    try {
      const invoke = await bridge()
      return fromBase64(
        await invoke<string>('biometric_read', { account, reason }),
      )
    } catch (err) {
      throw toProtectorError(err)
    }
  },

  async remove(account) {
    try {
      const invoke = await bridge()
      await invoke('biometric_delete', { account })
    } catch (err) {
      throw toProtectorError(err)
    }
  },
}

// ── Support probe ────────────────────────────────────────────────────

let supported: Promise<boolean> | null = null

/**
 * Whether to OFFER biometrics. Never `isStandalone` on its own — a Mac mini has
 * no sensor, a Windows build has no implementation, and a card the user cannot
 * complete is worse than no card.
 *
 * Cached at module level so a render loop cannot spam the IPC. Nothing
 * invalidates it: a Mac does not grow a Touch ID sensor mid-session, and the
 * one case that does change under us — the fingerprint set being re-enrolled —
 * surfaces as an `invalidated` unlock, which is where it belongs.
 */
export async function isBiometricSupported(
  port: BiometricPort = tauriBiometricPort,
): Promise<boolean> {
  if (!isStandalone) return false
  supported ??= port
    .probe()
    .then((result) => result.available)
    .catch(() => false)
  return supported
}

// ── Derivation (the part that is testable) ───────────────────────────

export async function deriveBiometricKek(
  kek: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return deriveKek(kek, salt, KEK_INFO_BIOMETRIC)
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : toBase64(randomBytes(16))
}

/**
 * Enroll Touch ID as an additional way into an existing vault.
 *
 * The protector id doubles as the OS keychain account, so the record and the
 * material it points at cannot drift apart. If the wrap throws after the item
 * was created, the item is removed again — an orphan in the user's Keychain
 * that nothing references is a Touch ID prompt with no owner.
 */
export async function enrollBiometricProtector(
  rawDek: Uint8Array<ArrayBuffer>,
  opts: { label: string; reason: string },
  port: BiometricPort = tauriBiometricPort,
): Promise<BiometricProtector> {
  const id = newId()
  const kekBytes = await port.create(id, opts.reason)
  try {
    const salt = randomBytes(BIOMETRIC_SALT_BYTES)
    const kek = await deriveBiometricKek(kekBytes, salt)
    const aad = protectorAad(VAULT_RECORD_VERSION, { id, type: 'biometric' })
    const { iv, wrapped } = await wrapDek(kek, rawDek, aad)
    return {
      id,
      type: 'biometric',
      createdAt: Date.now(),
      label: opts.label,
      platform: 'macos',
      salt: toBase64(salt),
      iv: toBase64(iv),
      wrapped: toBase64(wrapped),
    }
  } catch (err) {
    await port.remove(id).catch(() => undefined)
    throw err
  } finally {
    zero(kekBytes)
  }
}

/**
 * Caller MUST zeroize the returned bytes.
 *
 * Walks every enrolled biometric protector, because a record can hold more
 * than one in transit (a re-enrollment after an invalidation, briefly). A KEK
 * that reads but does not unwrap moves on to the next candidate and, if none
 * open, reports `invalidated` rather than `no-match` — there is no "wrong
 * finger" to have used, the OS already decided who was allowed to read it, so
 * the only remaining explanation is that the blob no longer matches its key.
 *
 * A failure to READ (a dismissed prompt above all) propagates immediately and
 * unchanged. Swallowing it to try the next candidate would mean a second prompt
 * for someone who just pressed Escape, and would land on the wrong final error.
 */
export async function recoverRawDekWithBiometric(
  record: VaultRecord,
  reason: string,
  port: BiometricPort = tauriBiometricPort,
): Promise<Uint8Array<ArrayBuffer>> {
  const candidates = biometricProtectors(record)
  if (candidates.length === 0) {
    throw new VaultProtectorError(
      'No biometric unlock is set up on this vault',
      'unavailable',
    )
  }

  let lastError: unknown = null
  for (const protector of candidates) {
    const kekBytes = await port.read(protector.id, reason)
    try {
      const kek = await deriveBiometricKek(kekBytes, fromBase64(protector.salt))
      return await unwrapRawDek(
        kek,
        fromBase64(protector.iv),
        fromBase64(protector.wrapped),
        protectorAad(VAULT_RECORD_VERSION, protector),
      )
    } catch (err) {
      lastError = err
    } finally {
      zero(kekBytes)
    }
  }

  throw new VaultProtectorError(
    lastError instanceof Error && lastError.message
      ? `Biometric unlock could not open the vault: ${lastError.message}`
      : 'Biometric unlock could not open the vault',
    'invalidated',
  )
}

/** Convenience mirror of `unlockWithPasskey`, for symmetry at call sites. */
export async function unlockWithBiometric(
  record: VaultRecord,
  reason: string,
  port: BiometricPort = tauriBiometricPort,
): Promise<CryptoKey> {
  const raw = await recoverRawDekWithBiometric(record, reason, port)
  try {
    return await importDek(raw)
  } finally {
    zero(raw)
  }
}

/**
 * Drop the OS-side material for one protector.
 *
 * Best-effort by contract: callers run this AFTER the record write that removed
 * the wrapped blob, so a failure here leaves a KEK that opens nothing. Throwing
 * would turn a successful removal into a visible error over a leftover the user
 * cannot act on.
 */
export async function removeBiometricMaterial(
  protector: BiometricProtector,
  port: BiometricPort = tauriBiometricPort,
): Promise<void> {
  await port.remove(protector.id)
}

/**
 * Clean up every biometric item a record points at. Never throws.
 *
 * For the paths that destroy the whole vault — the desktop opt-out and the
 * destructive reset. Both delete the record, and the record is the only thing
 * that remembers these accounts exist, so a cleanup that does not happen here
 * leaves Touch-ID-guarded items in the user's Keychain that nothing will ever
 * reference or remove again. Same argument lock-reset.ts already makes for the
 * vault record itself.
 */
export async function removeAllBiometricMaterial(
  record: VaultRecord | null,
  port: BiometricPort = tauriBiometricPort,
): Promise<void> {
  if (!record) return
  for (const protector of biometricProtectors(record)) {
    try {
      await port.remove(protector.id)
    } catch (err) {
      console.warn('[vault] could not remove the biometric key material:', err)
    }
  }
}
