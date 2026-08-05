// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Get the desktop app" — shown only in the browser build, where the terminal
 * is a dev/testing surface and the real product is the Tauri app.
 *
 * Composition mirrors the sign-in dialog: duotone artwork band on the left,
 * content on the right, seam blend between them. The two are the only
 * full-bleed dialogs in the app and they should read as one family.
 *
 * The pitch is only things the browser genuinely cannot do, each verifiable in
 * this repo rather than aspirational: four venues are unreachable over CORS
 * (see PlatformRestrictedError), `canBlockSleep` is `isStandalone`, close-to-
 * background is a Rust setting with no browser counterpart, and a browser
 * throttles then suspends a tab you are not looking at. The machine's own OS
 * gets the big button; the other builds stay one small click away, because
 * people do download for a second machine.
 */

import {
  AppWindow,
  BellRing,
  Bot,
  Download,
  KeyRound,
  Layers,
  MoonStar,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { DesktopBuild } from '@/lib/desktop-download'
import { DesktopStatueScene } from '@/components/desktop-statue'
import { track } from '@/lib/analytics-events'
import {
  DESKTOP_BUILDS,
  REPO_URL,
  detectOs,
  downloadAsset,
} from '@/lib/desktop-download'
import { openExternalUrl } from '@/lib/platform'

type DesktopDownloadDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DesktopDownloadDialog({
  open,
  onOpenChange,
}: DesktopDownloadDialogProps) {
  const { t } = useTranslation()
  const currentOs = detectOs()

  const primaryBuild = DESKTOP_BUILDS.find((build) => build.os === currentOs)
  const otherBuilds = DESKTOP_BUILDS.filter((build) => build !== primaryBuild)

  const download = (build: DesktopBuild, asset: string) => {
    track('desktop_download_clicked', {
      os: build.os,
      current_os: currentOs ?? 'unknown',
      asset,
    })
    void openExternalUrl(downloadAsset(asset))
  }

  const benefits = [
    { icon: Layers, key: 'venues' },
    { icon: Bot, key: 'bots' },
    { icon: BellRing, key: 'alerts' },
    { icon: MoonStar, key: 'sleep' },
    { icon: AppWindow, key: 'windows' },
    { icon: KeyRound, key: 'keychain' },
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-clip p-0 sm:max-w-md md:max-w-[880px]">
        <DialogTitle className="sr-only">{t('desktopCta.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('desktopCta.description')}
        </DialogDescription>

        {/* Artwork band + content. The band only appears at md+; mobile keeps
            the single content column, same rule as the sign-in dialog. */}
        <div className="relative grid md:grid-cols-[300px_1fr]">
          <DesktopStatueScene className="hidden md:block" />

          <div className="flex max-h-[85vh] flex-col overflow-y-auto p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('desktopCta.eyebrow')}
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">
              {t('desktopCta.title')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('desktopCta.description')}
            </p>

            <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {benefits.map(({ icon: Icon, key }) => (
                <div className="flex gap-3" key={key}>
                  <div className="mt-px flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {t(`desktopCta.benefits.${key}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t(`desktopCta.benefits.${key}.detail`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {primaryBuild ? (
              <div className="mt-6 space-y-2">
                <Button
                  className="w-full"
                  onClick={() =>
                    download(primaryBuild, primaryBuild.primary.asset)
                  }
                  size="lg"
                  type="button"
                >
                  <Download className="size-4" />
                  {t('desktopCta.downloadFor', {
                    os: t(primaryBuild.nameKey),
                  })}
                </Button>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{primaryBuild.primary.label}</span>
                  {primaryBuild.alternates.map((alternate) => (
                    <Button
                      className="h-auto p-0 text-xs font-normal underline-offset-4 hover:underline"
                      key={alternate.asset}
                      onClick={() => download(primaryBuild, alternate.asset)}
                      size="xs"
                      type="button"
                      variant="link"
                    >
                      {alternate.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
              {primaryBuild ? (
                <span className="text-xs text-muted-foreground">
                  {t('desktopCta.otherPlatforms')}
                </span>
              ) : null}
              {otherBuilds.map((build) => (
                <Button
                  key={build.os}
                  onClick={() => download(build, build.primary.asset)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Download className="size-3.5" />
                  {t(build.nameKey)}
                </Button>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {t('desktopCta.sourceNote')}{' '}
              <Button
                className="h-auto p-0 text-xs font-normal underline-offset-4 hover:underline"
                onClick={() =>
                  void openExternalUrl(`${REPO_URL}/releases/latest`)
                }
                size="xs"
                type="button"
                variant="link"
              >
                {t('desktopCta.releaseNotes')}
              </Button>
            </p>
          </div>

          {/* Seam blend — melts the artwork band into the content background.
              Outside the scene's `dark` scope so it targets the real
              (theme-aware) dialog background. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[300px] hidden w-20 -translate-x-full bg-gradient-to-r from-transparent to-background md:block"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
