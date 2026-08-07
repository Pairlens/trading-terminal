// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Renders nothing; raises one toast. Mounted by the Notifications and Bots
 * routes, which are the two pages whose feature only works while this page is
 * running — see `lib/desktop-nudge.ts` for why, and for every rule that decides
 * whether the toast appears at all.
 *
 * "Learn more" opens the same desktop dialog the nav-rail button does, through
 * the store, so there is one dialog and one place that knows how to pitch it.
 *
 * Built with `toast.custom` rather than the title/description/action shape,
 * because that shape lays out title, body and action in one row: two sentences
 * get squeezed into a ~250px column beside a centred button and wrap into a
 * six-line block. Here the copy owns the full width and the action sits under
 * it. The icon tile, the type pairing and the radius are lifted from the
 * dialog's benefit rows — the toast is the doorway to that dialog and should
 * look like it. Everything else (surface, width, shadow) matches what sonner
 * paints for the app's other toasts, since they stack together.
 *
 * It does not auto-dismiss. Auto-dismiss is right for feedback on something the
 * user just did — they are looking at the spot they clicked. This one arrives
 * unprompted while they are reading elsewhere on the page, so a four-second
 * window would mostly serve people who happened to glance right. It waits, and
 * it takes an explicit ✕ (or a swipe) to go.
 */
import { useEffect } from 'react'
import { MonitorDown, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'

import type { DesktopNudgeSurface } from '@/lib/desktop-nudge'
import {
  areSectionTipsDisabled,
  isSectionTourPending,
} from '@/components/onboarding/use-section-tour'
import { track } from '@/lib/analytics-events'
import {
  DESKTOP_NUDGE_DELAY_MS,
  hasSeenDesktopCta,
  markNudgeSeen,
  readNudgeSeen,
  shouldShowDesktopNudge,
} from '@/lib/desktop-nudge'
import { isHosted } from '@/lib/platform'
import { useDesktopCtaStore } from '@/stores/desktop-cta-store'

/** Copy per surface, spelled out so the keys stay greppable. */
const COPY: Record<DesktopNudgeSurface, { title: string; body: string }> = {
  notifications: {
    title: 'desktopCta.nudge.notifications.title',
    body: 'desktopCta.nudge.notifications.description',
  },
  bots: {
    title: 'desktopCta.nudge.bots.title',
    body: 'desktopCta.nudge.bots.description',
  },
}

export function DesktopSurfaceNudge({
  surface,
}: {
  surface: DesktopNudgeSurface
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const allowed = shouldShowDesktopNudge({
      hosted: isHosted,
      ctaSeen: hasSeenDesktopCta(),
      nudgeSeen: readNudgeSeen()[surface] === true,
      tourPending: isSectionTourPending(surface),
      tipsDisabled: areSectionTipsDisabled(),
    })
    if (!allowed) return

    const timer = setTimeout(() => {
      // Marked before it is shown, not on dismiss: ignoring a nudge is an
      // answer, and asking again would make it a nag.
      markNudgeSeen(surface)
      track('desktop_nudge_shown', { surface })

      toast.custom(
        (id) => (
          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-popover p-4 text-popover-foreground shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <MonitorDown className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">
                  {t(COPY[surface].title)}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t(COPY[surface].body)}
                </p>
              </div>
              <Button
                aria-label={t('common.dismiss')}
                className="-mr-1.5 -mt-1.5 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => toast.dismiss(id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  track('desktop_nudge_clicked', { surface })
                  useDesktopCtaStore.getState().open()
                  toast.dismiss(id)
                }}
                size="sm"
                type="button"
              >
                {t('desktopCta.nudge.learnMore')}
              </Button>
            </div>
          </div>
        ),
        {
          id: `desktop-nudge:${surface}`,
          // A custom toast is unstyled, which drops sonner's own width with the
          // rest of the card; take it back so this sits flush with any toast
          // stacked under it.
          className: 'w-[var(--width)]',
          duration: Infinity,
        },
      )
    }, DESKTOP_NUDGE_DELAY_MS)

    return () => clearTimeout(timer)
  }, [surface, t])

  return null
}
