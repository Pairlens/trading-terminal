// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Laptop,
  Layout,
  LayoutGrid,
  LayoutTemplate,
  Monitor,
  MonitorPlay,
  Tv,
} from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { PanesToolbar, PendingPanePlacementHint } from './panes-toolbar'
import type { ScreenPresetGroup } from '@/lib/layout/types'
import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'
import { track } from '@/lib/analytics-events'
import { templateMenuLabel } from '@/lib/workspace-store/template-labels'
import { useLayout } from '@/lib/layout/context'
import { useWorkspace } from '@/lib/layout/workspace-context'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { ShortcutHint } from '@/components/shortcut-hints'

const SCREEN_ICONS: Record<string, typeof Laptop> = {
  Laptop,
  LayoutGrid,
  Monitor,
  MonitorPlay,
  Tv,
}

type LayoutToolbarProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The layout controls in a page header: a Panes button for the panes of the
 * current layout, and a Workspaces button for swapping the whole layout out.
 * `open`/`onOpenChange` drive the Workspaces menu — the Panes menu owns its own.
 */
export function LayoutToolbar({ open, onOpenChange }: LayoutToolbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { dispatch } = useLayout()
  const workspace = useWorkspace()
  const { presets, screenPresets } = workspace

  // The workspaces dropdown, on whatever chord the user bound.
  const shortcuts = useMemo<Array<ShortcutDefinition>>(() => {
    if (!onOpenChange) return []
    return [
      {
        commandId: 'workspace.menu',
        action: () => onOpenChange(!open),
      },
    ]
  }, [onOpenChange, open])
  useKeyboardShortcuts(shortcuts)
  const menuShortcut = useKeybindingLabel('workspace.menu')

  const workspaceKind = workspaceAnalyticsKind(workspace.storageKey)

  const handlePreset = (key: string) => {
    const preset = presets[key]
    if (!preset) return
    track('preset_applied', { preset: key, workspace: workspaceKind })
    dispatch({
      type: 'APPLY_PRESET',
      layout: structuredClone(preset.layout),
    })
  }

  const handleScreenPreset = (preset: ScreenPresetGroup['presets'][number]) => {
    track('preset_applied', { preset: preset.key, workspace: workspaceKind })
    dispatch({
      type: 'APPLY_PRESET',
      layout: structuredClone(preset.layout),
    })
  }

  return (
    <>
      <PanesToolbar />

      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    aria-label={t('layout.workspaces')}
                  />
                }
              />
            }
          >
            <Layout className="size-3.5" />
            {t('layout.workspaces')}
            <ShortcutHint keys={menuShortcut} />
          </TooltipTrigger>
          <TooltipContent>
            {t('layout.workspaces')}{' '}
            {menuShortcut ? <Kbd className="ml-1.5">{menuShortcut}</Kbd> : null}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          {/* Existing presets — quick access */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('layout.presets')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          {Object.entries(presets).map(([key, preset]) => (
            <DropdownMenuItem key={key} onClick={() => handlePreset(key)}>
              <Layout className="size-3.5" />
              {templateMenuLabel(t, key, preset.label)}
            </DropdownMenuItem>
          ))}

          {/* Workspace Store — featured CTA, in the language of the
              user-menu / sign-in CTAs: tinted card, iris glow, badge. */}
          <div className="px-1 py-1">
            <DropdownMenuItem
              aria-label={t('layout.browseStore', 'Browse Workspace Store')}
              onClick={() => {
                onOpenChange?.(false)
                void navigate({ to: '/workspace-store' })
              }}
              className="group/store relative cursor-pointer gap-2.5 overflow-hidden rounded-[10px] border border-primary/15 bg-gradient-to-b from-primary/[0.09] via-primary/[0.03] to-transparent p-2 focus:border-primary/25 focus:bg-primary/[0.12] focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground"
            >
              {/* soft iris glow behind the badge */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-8 -right-5 size-20 rounded-full bg-primary/20 opacity-70 blur-2xl transition-opacity duration-200 group-focus/store:opacity-100"
              />
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-inset ring-primary/15">
                <LayoutTemplate className="size-4" />
              </div>
              <div className="relative grid flex-1 gap-0.5 leading-tight">
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                  {t('layout.workspaceStore', 'Workspace Store')}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {t('layout.browseStoreSubtitle', 'Ready-made layouts')}
                </span>
              </div>
              <ArrowRight className="relative size-3.5 shrink-0 self-center text-primary/70 transition-transform duration-200 group-focus/store:translate-x-0.5" />
            </DropdownMenuItem>
          </div>

          {screenPresets && screenPresets.length > 0 && (
            <>
              <DropdownMenuSeparator />

              {/* Screen-size submenus */}
              {screenPresets.map((group) => {
                const Icon = SCREEN_ICONS[group.icon] ?? Monitor
                return (
                  <DropdownMenuSub key={group.label}>
                    <DropdownMenuSubTrigger>
                      <Icon className="size-3.5" />
                      {group.label}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      {group.presets.map((preset) => (
                        <DropdownMenuItem
                          key={preset.key}
                          onClick={() => handleScreenPreset(preset)}
                        >
                          {preset.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PendingPanePlacementHint />
    </>
  )
}
