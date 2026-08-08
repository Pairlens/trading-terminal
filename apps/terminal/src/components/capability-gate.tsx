// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Trans, useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ShieldCheck, Sparkles } from 'lucide-react'

import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import type { ReactNode } from 'react'

import type { CapabilityAccessResult } from '@pairlens/plugin-system'
import { SignInDialog } from '@/components/sign-in-dialog'

// ---------------------------------------------------------------------------
// Auth Required Prompt
// ---------------------------------------------------------------------------

type AuthRequiredPromptProps = {
  /** What signing in unlocks, phrased as an invitation — not a wall */
  title?: string
  description?: string
}

/**
 * Lean-in invitation for the few features that genuinely need an account
 * (AI copilot, research). Signing up is beneficial, never necessary — so
 * this reads as an offer led by the AI orb with the privacy promise up
 * front, not a lock.
 */
export function AuthRequiredPrompt({
  title,
  description,
}: AuthRequiredPromptProps) {
  const { t } = useTranslation()
  return (
    // Centred by `my-auto` on the card rather than by `justify-center` on the
    // scroller. They look identical whenever the card fits — which is every
    // desktop pane — but a centred flex child that does NOT fit overflows past
    // BOTH ends of its scroll container and the top half becomes unreachable.
    // Auto margins collapse to zero instead, so a short viewport (a phone's
    // panel slice) gets a card that starts at the top and scrolls.
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-2">
      <Empty className="my-auto max-w-[280px] flex-none">
        <EmptyHeader className="gap-3">
          <AiOrb size="72px" className="mb-2" />
          <EmptyTitle className="text-base">
            {title ?? t('capabilityGate.authTitle')}
          </EmptyTitle>
          <EmptyDescription className="leading-relaxed">
            {description ?? t('capabilityGate.authDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <SignInDialog>
          <Button size="lg" className="mt-6 gap-2">
            <Sparkles className="size-4" />
            {t('capabilityGate.signInFree')}
          </Button>
        </SignInDialog>
        <p className="mt-4 flex items-start justify-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          {t('capabilityGate.authNote')}
        </p>
      </Empty>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upgrade Required Prompt
// ---------------------------------------------------------------------------

export function UpgradeRequiredPrompt({
  pluginId,
  requiredAccessLevel,
}: {
  pluginId: string | null
  requiredAccessLevel?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
      <Empty className="max-w-xs">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles className="size-5" />
          </EmptyMedia>
          <EmptyTitle>{t('capabilityGate.upgradeRequired')}</EmptyTitle>
          <EmptyDescription>
            {/* <Trans> keeps the access level emphasised inside the sentence.
                Its position moves per language, so neither splitting the
                string around it nor dropping the styling is right. */}
            {requiredAccessLevel ? (
              <Trans
                i18nKey="capabilityGate.upgradeDescriptionLevel"
                values={{ level: requiredAccessLevel }}
                components={{ b: <b className="font-medium" /> }}
              />
            ) : (
              t('capabilityGate.upgradeDescriptionGeneric')
            )}
          </EmptyDescription>
        </EmptyHeader>
        {pluginId && (
          <Button
            variant="outline"
            className="mt-4 gap-2"
            nativeButton={false}
            render={<Link to="/plugins" search={{ manage: pluginId }} />}
          >
            <Sparkles className="size-4" />
            {t('capabilityGate.managePlugin')}
          </Button>
        )}
      </Empty>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CapabilityGate
// ---------------------------------------------------------------------------

type CapabilityGateProps = {
  access: CapabilityAccessResult
  unavailableFallback?: ReactNode
  children: ReactNode
}

export function CapabilityGate({
  access,
  unavailableFallback,
  children,
}: CapabilityGateProps) {
  if (access.status === 'granted') return <>{children}</>
  if (access.status === 'auth-required') return <AuthRequiredPrompt />
  if (access.status === 'upgrade-required') {
    return (
      <UpgradeRequiredPrompt
        pluginId={access.pluginId}
        requiredAccessLevel={access.requiredAccessLevel}
      />
    )
  }
  return <>{unavailableFallback ?? null}</>
}
