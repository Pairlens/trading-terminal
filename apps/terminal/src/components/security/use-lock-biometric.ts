// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'

/**
 * Whether biometric unlock is set up on this device, and whether the device
 * could do it at all.
 *
 * `lib/security/lock-biometric` is imported on demand rather than at the top:
 * it reaches `lib/keychain`, which pulls the Tauri bridge and the whole vault
 * behind it, and the lock overlay is mounted in the root shell on every boot.
 * The same reasoning already keeps PBKDF2 and the reset routine out of that
 * bundle.
 *
 * `supported` starts null and stays null until the probe answers, so the
 * settings row renders nothing rather than flashing a toggle in and out. Both
 * flags default to "no": a device that cannot answer the question gets the
 * password field it already has.
 */
export function useLockBiometric(): {
  enrolled: boolean
  supported: boolean | null
} {
  const [enrolled, setEnrolled] = React.useState(false)
  const [supported, setSupported] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    void import('@/lib/security/lock-biometric').then(async (m) => {
      if (cancelled) return
      // Subscribe BEFORE the read: enrolling in a sibling window mid-probe
      // would otherwise land on a listener that does not exist yet.
      unsubscribe = m.subscribeLockBiometric(() => {
        setEnrolled(m.getLockBiometricEnrolled())
      })
      const [isEnrolled, isSupported] = await Promise.all([
        m.refreshLockBiometric(),
        m.isLockBiometricSupported(),
      ])
      if (cancelled) return
      setEnrolled(isEnrolled)
      setSupported(isSupported)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return { enrolled, supported }
}
