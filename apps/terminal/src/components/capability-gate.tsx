// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
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
  title = 'One free sign-in away',
  description = 'This feature runs through your Pairlens account.',
}: AuthRequiredPromptProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
      <Empty className="max-w-[280px]">
        <EmptyHeader className="gap-3">
          <AiOrb size="72px" className="mb-2" />
          <EmptyTitle className="text-base">{title}</EmptyTitle>
          <EmptyDescription className="leading-relaxed">
            {description}
          </EmptyDescription>
        </EmptyHeader>
        <SignInDialog>
          <Button size="lg" className="mt-6 gap-2">
            <Sparkles className="size-4" />
            Sign in free
          </Button>
        </SignInDialog>
        <p className="mt-4 flex items-start justify-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          Takes 30 seconds. Your exchange keys never leave this device.
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
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
      <Empty className="max-w-xs">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles className="size-5" />
          </EmptyMedia>
          <EmptyTitle>Upgrade required</EmptyTitle>
          <EmptyDescription>
            This feature requires{' '}
            {requiredAccessLevel ? (
              <span className="font-medium">{requiredAccessLevel}</span>
            ) : (
              'a higher'
            )}{' '}
            access level.
          </EmptyDescription>
        </EmptyHeader>
        {pluginId && (
          <Button
            variant="outline"
            className="mt-4 gap-2"
            render={<Link to="/plugins" search={{ manage: pluginId }} />}
          >
            <Sparkles className="size-4" />
            Manage Plugin
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
