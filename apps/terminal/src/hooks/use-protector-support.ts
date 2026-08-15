// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Can this machine actually raise that prompt?"
 *
 * Both hooks probe rather than infer, and both are the reason a surface may
 * offer a protector at all. `isStandalone` is not a substitute: a Mac mini has
 * no Touch ID sensor and the Windows/Linux builds carry no implementation, so
 * an "Add Touch ID" button there is one that cannot finish what it starts.
 *
 * Each probe's result is cached at module level inside the `is*Supported`
 * function it awaits, so mounting these anywhere costs one call in total no
 * matter how many surfaces ask. They started life private to the Security
 * settings panel; anything that offers to ENROL a protector needs the same
 * answer, and a second copy is how one surface ends up offering a button the
 * other has already proven dead.
 */
import { useEffect, useState } from 'react'

export function useBiometricSupported(): boolean {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let cancelled = false
    void import('@/lib/security/vault/vault-biometric').then(async (m) => {
      const ok = await m.isBiometricSupported().catch(() => false)
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return supported
}

/** Same shape and same reasoning as `useBiometricSupported`, for passkeys. */
export function usePasskeySupported(): boolean {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let cancelled = false
    void import('@/lib/security/vault/vault-passkey').then(async (m) => {
      const ok = await m.isPasskeySupported().catch(() => false)
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return supported
}
