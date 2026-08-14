// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a pane shows in a browser when the pane itself is desktop-only.
 *
 * The picker already badges and refuses these panes here, so this is the
 * backstop for the ways one arrives anyway: a layout saved on the desktop and
 * synced, a workspace template, an omni-search jump. The pane says what it is
 * rather than rendering a surface that quietly does nothing.
 *
 * Narrower than `DesktopOnlyState`, which replaces the WHOLE workspace because
 * every pane in it streams from the unreachable venue. Here exactly one pane is
 * affected and the rest of the workspace is live, so this stays inside its own
 * box, sizes down with it, and opens the shared download dialog through the
 * store instead of mounting a second copy of it.
 */
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'

import { OS_ICON } from '@/components/feedback/os-icons'
import { detectOs } from '@/lib/desktop-download'
import { useDesktopCtaStore } from '@/stores/desktop-cta-store'

export function PaneDesktopOnly({
  titleKey,
  descriptionKey,
}: {
  titleKey: string
  descriptionKey: string
}) {
  const { t } = useTranslation()
  const openDesktopCta = useDesktopCtaStore((s) => s.open)

  // The machine's own platform mark, so the button says WHICH build it means.
  const os = detectOs()
  const OsIcon = os ? OS_ICON[os] : null

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10">
          {OsIcon ? (
            <OsIcon className="size-4 text-primary" />
          ) : (
            <Monitor className="size-4 text-primary" />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">{t(titleKey)}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t(descriptionKey)}
        </p>
        <Button
          size="sm"
          className="mt-4 gap-1.5"
          onClick={() => openDesktopCta()}
        >
          {OsIcon ? <OsIcon className="size-3.5" /> : null}
          {t('nav.getDesktopApp')}
        </Button>
      </div>
    </div>
  )
}
