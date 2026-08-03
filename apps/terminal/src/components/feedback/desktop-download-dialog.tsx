// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Get the desktop app" — shown only in the browser build, where the terminal
 * is a dev/testing surface and the real product is the Tauri app.
 *
 * The pitch is the three things the browser genuinely cannot do, no more:
 * credentials in the OS keychain, native performance, and silent updates.
 * The machine's own OS gets the big button; the other builds stay one small
 * click away, because people do download for a second machine.
 */

import { Download, KeyRound, RefreshCw, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { DesktopBuild } from '@/lib/desktop-download'
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
    { icon: KeyRound, text: t('desktopCta.benefitKeychain') },
    { icon: Zap, text: t('desktopCta.benefitPerformance') },
    { icon: RefreshCw, text: t('desktopCta.benefitUpdates') },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('desktopCta.title')}</DialogTitle>
          <DialogDescription>{t('desktopCta.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {benefits.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-4 text-primary" />
              </div>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {primaryBuild ? (
          <div className="space-y-2 rounded-xl border p-4">
            <Button
              className="w-full"
              onClick={() => download(primaryBuild, primaryBuild.primary.asset)}
              size="lg"
              type="button"
            >
              <Download className="size-4" />
              {t('desktopCta.downloadFor', { os: t(primaryBuild.nameKey) })}
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

        <div className="space-y-2">
          {primaryBuild ? (
            <p className="text-xs text-muted-foreground">
              {t('desktopCta.otherPlatforms')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
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
        </div>

        <p className="text-xs text-muted-foreground">
          {t('desktopCta.sourceNote')}{' '}
          <Button
            className="h-auto p-0 text-xs font-normal underline-offset-4 hover:underline"
            onClick={() => void openExternalUrl(`${REPO_URL}/releases/latest`)}
            size="xs"
            type="button"
            variant="link"
          >
            {t('desktopCta.releaseNotes')}
          </Button>
        </p>
      </DialogContent>
    </Dialog>
  )
}
