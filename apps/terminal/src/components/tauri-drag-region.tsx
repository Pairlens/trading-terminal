// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useSyncExternalStore } from 'react'
import { AppWindow, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { isStandalone, openTerminalWindow } from '@/lib/platform'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import {
  getCanGoBack,
  getCanGoForward,
  goBack,
  goForward,
  subscribeNavHistory,
} from '@/lib/nav-history'

// Track native macOS fullscreen state — the drag region is unnecessary in
// fullscreen because the traffic lights are hidden and there's no titlebar
// to drag. We detect fullscreen by comparing the viewport height to the
// screen height — in native macOS fullscreen the webview fills the screen.
// The CSS media query `(display-mode: fullscreen)` only matches the web
// Fullscreen API, not the native OS fullscreen triggered by the green button.
const listeners = new Set<() => void>()
let isFullscreen = false

function checkFullscreen(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerHeight >= screen.height - 1
}

if (typeof window !== 'undefined') {
  isFullscreen = checkFullscreen()
  window.addEventListener('resize', () => {
    const next = checkFullscreen()
    if (next !== isFullscreen) {
      isFullscreen = next
      listeners.forEach((l) => l())
    }
  })
}

function subscribeFullscreen(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getFullscreen() {
  return isFullscreen
}

/**
 * Draggable region for window dragging in Tauri desktop mode.
 * On macOS with titleBarStyle: "Overlay", the native traffic lights sit in
 * the top-left. This component renders a draggable strip at the top of the
 * window so the user can drag it from the title bar area.
 *
 * Uses Tauri's data-tauri-drag-region attribute for native drag support.
 * Requires "core:window:allow-start-dragging" in capabilities/default.json.
 *
 * Renders nothing in browser mode or when the window is fullscreen.
 */
export function TauriDragRegion({ sectionLabel }: { sectionLabel?: string }) {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, getFullscreen)
  if (!isStandalone || fullscreen) return null

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-[9999] flex h-8 items-center"
    >
      {/* Centered section label */}
      {sectionLabel && (
        <span
          data-tauri-drag-region
          className="pointer-events-none absolute inset-x-0 select-none text-center text-[11px] font-medium text-muted-foreground"
        >
          {sectionLabel}
        </span>
      )}
      <HistoryNavButtons />
      <NewWindowButton />
    </div>
  )
}

/**
 * Back / forward arrows at the far left of the titlebar, clearing the macOS
 * traffic lights. The webview keeps a real history stack, so this is the
 * browser's back button for an app that has no browser chrome — the arrows
 * disable themselves when there's nowhere to go.
 *
 * The wrapper stays a drag region so the gap next to the traffic lights still
 * drags the window; Tauri matches the attribute on the event target itself, so
 * the buttons inside remain clickable.
 */
function HistoryNavButtons() {
  const { t } = useTranslation()
  const backShortcut = useKeybindingLabel('general.back')
  const forwardShortcut = useKeybindingLabel('general.forward')
  const canBack = useSyncExternalStore(
    subscribeNavHistory,
    getCanGoBack,
    () => false,
  )
  const canForward = useSyncExternalStore(
    subscribeNavHistory,
    getCanGoForward,
    () => false,
  )

  return (
    <div
      data-tauri-drag-region
      className="flex items-center gap-0.5"
      style={{ paddingLeft: TRAFFIC_LIGHT_WIDTH }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground"
              aria-label={t('titlebar.back')}
              disabled={!canBack}
              onClick={goBack}
            />
          }
        >
          <ChevronLeft />
        </TooltipTrigger>
        <TooltipContent>
          {t('titlebar.back')}
          {backShortcut ? <Kbd className="ml-1">{backShortcut}</Kbd> : null}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground"
              aria-label={t('titlebar.forward')}
              disabled={!canForward}
              onClick={goForward}
            />
          }
        >
          <ChevronRight />
        </TooltipTrigger>
        <TooltipContent>
          {t('titlebar.forward')}
          {forwardShortcut ? (
            <Kbd className="ml-1">{forwardShortcut}</Kbd>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * "New window" button in the top-right of the titlebar. Duplicates the
 * current view into a new Tauri window — pro users live in many windows.
 * Deliberately NOT a drag region so clicks land on the button.
 */
function NewWindowButton() {
  const { t } = useTranslation()
  const newWindowShortcut = useKeybindingLabel('general.newWindow')
  return (
    <Button
      size="xs"
      variant="ghost"
      className="ml-auto mr-2 gap-1.5 text-muted-foreground"
      onClick={() =>
        void openTerminalWindow(
          window.location.pathname + window.location.search,
        )
      }
    >
      <AppWindow className="size-3.5" />
      {t('titlebar.newWindow')}
      {newWindowShortcut ? (
        <Kbd className="h-4 bg-transparent px-0 text-[10px] text-muted-foreground/70">
          {newWindowShortcut}
        </Kbd>
      ) : null}
    </Button>
  )
}

/** True when the desktop app needs the titlebar drag region (not fullscreen). */
export function useNeedsTitlebar() {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, getFullscreen)
  return isStandalone && !fullscreen
}

/**
 * Left padding value for content that sits next to the macOS traffic lights.
 * Only macOS draws them inside the webview (titleBarStyle: "Overlay"); other
 * desktop platforms keep their native titlebar, so titlebar content there only
 * needs a normal edge gutter.
 */
export const TRAFFIC_LIGHT_WIDTH = !isStandalone
  ? 0
  : /Mac/i.test(navigator.userAgent)
    ? 78
    : 8
