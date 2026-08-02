// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useNavigate } from '@tanstack/react-router'

import type { ColorMode } from '@/lib/settings/color-mode'
import { authClient, hasAppServer } from '@/lib/auth-client'
import { useOptimisticSession } from '@/lib/session'
import {
  patchDesktopBridge,
  publishDesktopBridge,
} from '@/lib/settings/desktop-bridge'

/**
 * Publishes the React-only capabilities the desktop OS menu can't reach on its
 * own — next-themes color mode and the live session / sign-in-out actions —
 * into the desktop bridge singleton the menu reads. Renders nothing; mounted
 * once inside the terminal shell on desktop builds only.
 */
export function DesktopMenuBridge() {
  const { theme, setTheme } = useTheme()
  const { session } = useOptimisticSession()
  const navigate = useNavigate()

  // Depend on the derived boolean, not the session object — its identity can
  // change every render, and each publish pushes IPC to the native menu.
  const hasSession = Boolean(session)

  useEffect(() => {
    publishDesktopBridge({
      colorMode: (theme as ColorMode | undefined) ?? 'system',
      // Re-assert the bridge snapshot immediately: re-selecting the active mode
      // is a no-op for next-themes, so this effect wouldn't re-run to refresh
      // the menu's checkmark. patchDesktopBridge forces the choice re-check.
      setColorMode: (mode) => {
        setTheme(mode)
        patchDesktopBridge({ colorMode: mode })
      },
      hasSession,
      hasAppServer,
      signIn: () => void navigate({ to: '/sign-in' }),
      signOut: () => void authClient.signOut(),
    })
  }, [theme, setTheme, hasSession, navigate])

  return null
}
