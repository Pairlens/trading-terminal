// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Approve or decline a surface action ──────────────────────────────
//
// A surface can mark one of its actions `needsApproval`. Those are
// declared to the model WITHOUT an execute, so the AI SDK parks the
// call in `input-available` and the run waits here until the user
// answers. Approving runs the action for real and reports the result
// back into the conversation, which is what lets the model carry on
// knowing what actually happened.
//
// Trading has its own richer card (paper/live toggle, press-and-hold,
// standing consent). This is the generic one, for everything a pane
// wants confirmed before it happens.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ShieldQuestion, X } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { Spinner } from '@pairlens/ui/components/ui/spinner'

export type AssistantApprovalCardProps = {
  /** Model-facing action name, shown humanized. */
  title: string
  /** What the action will do, from the action's own description. */
  description: string
  /** The arguments the model chose, rendered for review. */
  args: Record<string, unknown> | undefined
  /** Set once answered, so replayed history renders as a record. */
  outcome: 'approved' | 'declined' | null
  onApprove: () => Promise<void> | void
  onDecline: () => void
}

export function AssistantApprovalCard({
  title,
  description,
  args,
  outcome,
  onApprove,
  onDecline,
}: AssistantApprovalCardProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const argEntries = Object.entries(args ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )

  return (
    <div className="ai-tile rounded-xl p-3 text-xs">
      <div className="flex items-center gap-1.5">
        <ShieldQuestion
          className="size-3.5 shrink-0"
          style={{ color: 'var(--magic-1)' }}
        />
        <span className="font-medium">{title}</span>
      </div>

      <p className="text-muted-foreground mt-1 leading-relaxed">
        {description}
      </p>

      {argEntries.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-[var(--ai-edge-soft)] pt-2.5 font-mono text-[10px]">
          {argEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="truncate">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {outcome ? (
        <p className="text-muted-foreground mt-2 flex items-center gap-1">
          {outcome === 'approved' ? (
            <Check className="size-3" />
          ) : (
            <X className="size-3" />
          )}
          {outcome === 'approved'
            ? t('assistantDock.approvalApproved')
            : t('assistantDock.approvalDeclined')}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onApprove()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? (
              <Spinner className="size-3" />
            ) : (
              <Check className="size-3" />
            )}
            {t('assistantDock.approvalApprove')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1 text-xs"
            disabled={busy}
            onClick={onDecline}
          >
            <X className="size-3" />
            {t('assistantDock.approvalDecline')}
          </Button>
        </div>
      )}
    </div>
  )
}
