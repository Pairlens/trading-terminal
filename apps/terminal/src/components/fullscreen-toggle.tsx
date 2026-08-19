// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import * as React from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { HEADER_ICON } from '@/components/chrome/header-chrome'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import {
  isFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from '@/lib/fullscreen'
import { isStandalone } from '@/lib/platform'

function useIsFullscreen(): boolean {
  return React.useSyncExternalStore(
    subscribeFullscreen,
    isFullscreen,
    () => false,
  )
}

const NO_SHORTCUTS: Array<ShortcutDefinition> = []
const FULLSCREEN_SHORTCUTS: Array<ShortcutDefinition> = [
  {
    commandId: 'general.toggleFullscreen',
    action: () => void toggleFullscreen(),
  },
]

/**
 * Registers the `general.toggleFullscreen` chord. Mounted once at the root so
 * the binding lives exactly once, regardless of which page (and header) is on
 * screen. No-op on desktop, where the command is not offered at all.
 */
export function FullscreenShortcut(): null {
  useKeyboardShortcuts(isStandalone ? NO_SHORTCUTS : FULLSCREEN_SHORTCUTS)
  return null
}

/**
 * The header's fullscreen toggle — web builds only (desktop's native window
 * controls own fullscreen there).
 */
export function FullscreenToggleButton() {
  const { t } = useTranslation()
  const active = useIsFullscreen()
  const shortcut = useKeybindingLabel('general.toggleFullscreen')

  if (isStandalone) return null

  const label = active ? t('fullscreen.exit') : t('fullscreen.enter')
  const Icon = active ? Minimize : Maximize
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={HEADER_ICON}
            aria-label={label}
            onClick={() => void toggleFullscreen()}
          >
            <Icon className="size-3.5" />
          </button>
        }
      />
      <TooltipContent>
        {label}
        {shortcut ? ` (${shortcut})` : ''}
      </TooltipContent>
    </Tooltip>
  )
}
