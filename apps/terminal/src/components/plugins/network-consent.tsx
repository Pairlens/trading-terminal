// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import type { ReactNode } from 'react'

type ConsentTarget = { name: string; hosts: Array<string> }

type Pending = ConsentTarget & { resolve: (granted: boolean) => void }

/**
 * Shared "allow this plugin to reach external servers?" consent flow.
 * `requestNetworkConsent({ name, hosts })` returns a promise that resolves to the
 * user's decision; render `dialog` somewhere in the tree. On desktop the terminal
 * only permits network egress to hosts the user has explicitly allowed — this is
 * the "be upfront about what your terminal connects to" step. Approving persists a
 * grant and reloads to apply the widened CSP (handled by the caller).
 */
export function useNetworkConsent(): {
  requestNetworkConsent: (target: ConsentTarget) => Promise<boolean>
  dialog: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  // Track the live pending consent so we can resolve it if the component
  // unmounts mid-flow (otherwise the caller's `await` would hang forever).
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  const requestNetworkConsent = useCallback(
    (target: ConsentTarget) =>
      new Promise<boolean>((resolve) => {
        // Supersede any earlier prompt so its awaiter doesn't hang.
        pendingRef.current?.resolve(false)
        setPending({ ...target, resolve })
      }),
    [],
  )

  const settle = useCallback((granted: boolean) => {
    pendingRef.current?.resolve(granted)
    pendingRef.current = null
    setPending(null)
  }, [])

  useEffect(
    () => () => {
      // Unmounted with a decision outstanding → treat as declined.
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    },
    [],
  )

  const dialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Globe className="size-5 text-sky-500" />
            Allow “{pending?.name}” to connect?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This plugin needs to reach servers outside Pairlens. Your terminal
            will send network requests to the hosts below. Allow only if you
            trust this plugin — you can uninstall it at any time to revoke
            access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            It will be able to connect to:
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
            {pending?.hosts.map((host) => (
              <li key={host} className="break-all">
                {host}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Approving reloads the terminal to apply the change.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            Don’t allow
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>
            Allow &amp; reload
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { requestNetworkConsent, dialog }
}
