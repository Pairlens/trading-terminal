// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The growth dialog: a rare, well-earned ask to support Pairlens. Today the
 * only action is a GitHub star; review sites and friends will join the
 * registry in lib/growth/growth-prompt.ts, each with a copy block here.
 *
 * When it shows is the whole feature — the engine only surfaces it to
 * people who have used the terminal on separate days and gone deep on at
 * least one axis, at most once per two weeks, and every "no" sticks. See
 * lib/growth/growth-prompt.ts for the rules and hooks/use-growth-prompt.ts
 * for the host.
 *
 * Composition mirrors the sign-in and desktop-download dialogs: duotone
 * artwork band on the left, content on the right, seam blend between them —
 * the three full-bleed dialogs in the app read as one family.
 */

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { cn } from '@pairlens/ui/lib/utils'

import type { GrowthActionId } from '@/lib/growth/growth-prompt'
import { GrowthStatueScene } from '@/components/growth/growth-statue'
import { useGrowthPrompt } from '@/hooks/use-growth-prompt'
import { openExternalUrl } from '@/lib/platform'

/** The GitHub mark, from GitHub's own octicons. Inherits text color. */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-4 shrink-0', className)}
    >
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}

/**
 * Per-action copy and CTA chrome. Keys are full literals so the i18n orphan
 * audit can see them.
 */
const CONTENT: Record<
  GrowthActionId,
  {
    titleKey: string
    descriptionKey: string
    noteKey: string
    ctaKey: string
    thanksKey: string
    Icon: (props: { className?: string }) => React.ReactNode
  }
> = {
  'github-star': {
    titleKey: 'growth.githubStar.title',
    descriptionKey: 'growth.githubStar.description',
    noteKey: 'growth.githubStar.note',
    ctaKey: 'growth.githubStar.cta',
    thanksKey: 'growth.githubStar.thanks',
    Icon: GithubIcon,
  },
}

/**
 * Mount once above the shell branch: the engine decides when (and whether)
 * anything renders, so this is inert for everyone who hasn't earned an ask.
 */
export function GrowthPromptHost() {
  const { t } = useTranslation()
  const prompt = useGrowthPrompt()

  if (!prompt.action) return null
  const content = CONTENT[prompt.action.id]
  const url = prompt.action.url
  const { Icon } = content

  const onCta = () => {
    prompt.complete()
    void openExternalUrl(url)
    toast.success(t(content.thanksKey))
  }

  return (
    <Dialog open={prompt.open} onOpenChange={prompt.onOpenChange}>
      <DialogContent
        className="gap-0 overflow-clip p-0 sm:max-w-md md:max-w-[680px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t(content.titleKey)}</DialogTitle>
        <DialogDescription className="sr-only">
          {t(content.descriptionKey)}
        </DialogDescription>

        {/* Artwork band + content. The band only appears at md+; mobile
            keeps the single content column, same rule as the sign-in and
            desktop-download dialogs. */}
        <div className="relative grid md:grid-cols-[260px_1fr]">
          <GrowthStatueScene className="hidden md:block" />

          <div className="flex flex-col p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('growth.eyebrow')}
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">
              {t(content.titleKey)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(content.descriptionKey)}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(content.noteKey)}
            </p>

            <div className="mt-6 space-y-2">
              <Button
                className="w-full"
                onClick={onCta}
                size="lg"
                type="button"
              >
                <Icon className="size-4" />
                {t(content.ctaKey)}
              </Button>
              <Button
                className="w-full"
                onClick={prompt.snooze}
                size="lg"
                type="button"
                variant="outline"
              >
                {t('growth.later')}
              </Button>
            </div>

            <div className="mt-4 flex justify-center">
              <Button
                className="h-auto p-0 text-xs font-normal text-muted-foreground underline-offset-4 hover:underline"
                onClick={prompt.optOut}
                size="xs"
                type="button"
                variant="link"
              >
                {t('growth.never')}
              </Button>
            </div>
          </div>

          {/* Seam blend — melts the artwork band into the content
              background. Outside the scene's `dark` scope so it targets the
              real (theme-aware) dialog background. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[260px] hidden w-20 -translate-x-full bg-gradient-to-r from-transparent to-background md:block"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
