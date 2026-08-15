// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The credential vault's public surface.
 *
 * What it is: one random 256-bit data key encrypts every stored credential;
 * each enrolled protector (a password, a passkey with the WebAuthn PRF
 * extension, Touch ID on a Mac) independently wraps that data key. Any one
 * protector opens the vault, and nothing but ciphertext is ever at rest.
 *
 * What it is not, and the UI must say so: this protects stored keys against
 * someone who copies the browser profile or the disk. It does not protect
 * keys in use — anything running inside the page can ask an unlocked vault
 * for a key, exactly the way the app does. The desktop app remains the
 * recommendation for the most valuable keys.
 *
 * Note also that `apps/cli` reads API keys from argv and never touches this
 * module, so the vault does not cover CLI trading.
 *
 * Import from the specific module in hot paths (lib/keychain.ts does); this
 * barrel pulls in the lock store via the hard-lock action.
 */

export {
  VaultConflictError,
  VaultEnrollmentRequiredError,
  VaultMigrationError,
  VaultProtectorError,
  VaultProofRequiredError,
  VaultSealedError,
  isVaultEnrollmentRequired,
  isVaultProofRequired,
  isVaultSealed,
} from './vault-errors'
export type { VaultProtectorErrorKind } from './vault-errors'

export {
  PRF_SALT_BYTES,
  VAULT_RECORD_VERSION,
  biometricProtectors,
  parseVaultRecord,
  passkeyProtectors,
  passwordProtectors,
  removalStrandsVault,
} from './vault-record'
export type {
  BiometricProtector,
  PasskeyProtector,
  PasswordProtector,
  VaultProtector,
  VaultRecord,
  VaultRecordState,
} from './vault-record'

export { CIPHER_V2, VAULT_PBKDF2_ITERATIONS } from './vault-crypto'

export {
  KEY_REQUEST_TIMEOUT_MS,
  ensureVaultLoaded,
  getDek,
  getDekOrThrow,
  getVaultRecord,
  getVaultState,
  hasPasswordProtector,
  initVaultSession,
  isVaultEnrolled,
  isVaultProven,
  isVaultUnlocked,
  requestDekFromSiblings,
  sealVault,
  subscribeVault,
  useVaultState,
} from './vault-session'
export type { VaultState } from './vault-session'

export { isPasskeySupported } from './vault-passkey'
export type { PasskeyPrfPort, VaultIdentity } from './vault-passkey'

export {
  isBiometricSupported,
  removeAllBiometricMaterial,
} from './vault-biometric'
export type { BiometricAvailability, BiometricPort } from './vault-biometric'

export {
  addProtector,
  changeVaultPassword,
  createVault,
  finishPendingMigration,
  refreshVaultRecord,
  removeProtector,
  unlockVault,
} from './vault-protectors'
export type { EnrollInput, UnlockInput } from './vault-protectors'

export { hasVaultedValues, listIndexedKeys } from './vault-values'
export { hardLock } from './vault-hard-lock'
export { readUiMirror } from './vault-storage'
export type { VaultUiMirror } from './vault-storage'

export {
  MIN_PASSWORD_LENGTH,
  assertCanAddCredential,
  mustEnrollFirst,
  vaultRequiredForNewCredentials,
} from './vault-policy'

export { disableVault, listVaultedKeys } from './vault-teardown'
export type { TeardownResult } from './vault-teardown'

export { startVaultBootstrap } from './vault-bootstrap'
export { sweepLegacyBrowserStorage } from './legacy-sweep'
