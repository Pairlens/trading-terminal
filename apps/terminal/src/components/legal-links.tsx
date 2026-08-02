// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Trans, useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'

import type { ReactNode } from 'react'
import type { LegalDoc } from '@/lib/legal'
import { LEGAL_URLS } from '@/lib/legal'
import { openExternalUrl } from '@/lib/platform'

// ---------------------------------------------------------------------------
// Links to the public Privacy Policy and Terms & Conditions.
//
// Used wherever consent legally matters: the sign-in footer, the onboarding
// analytics opt-in, Settings → Privacy, and the Intelligence checkout entry
// points. Every link hands off to the system browser — the desktop build runs
// in a Tauri webview, so a plain target="_blank" would either be swallowed or
// navigate the app away from itself.
// ---------------------------------------------------------------------------

const LABEL_KEYS: Record<LegalDoc, string> = {
  privacy: 'legal.privacy',
  terms: 'legal.terms',
}

/** A single legal-document link. Falls back to the document's own name. */
export function LegalLink({
  doc,
  className,
  children,
}: {
  doc: LegalDoc
  className?: string
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const url = LEGAL_URLS[doc]

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        // The href stays for a11y and right-click → copy; the click itself
        // goes through the shell opener.
        event.preventDefault()
        void openExternalUrl(url)
      }}
      className={cn(
        'text-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-foreground',
        className,
      )}
    >
      {children ?? t(LABEL_KEYS[doc])}
    </a>
  )
}

const NOTICE_KEYS = {
  /** Sign-in footer — continuing accepts both documents. */
  signIn: 'legal.signInConsent',
  /** Analytics opt-in — what we collect is described in the policy. */
  analytics: 'legal.analyticsNote',
  /** Intelligence checkout — subscribing accepts the terms. */
  checkout: 'legal.checkoutConsent',
} as const

/** One-line consent notice with the document names rendered as links. */
export function LegalNotice({
  kind,
  className,
}: {
  kind: keyof typeof NOTICE_KEYS
  className?: string
}) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      <Trans
        i18nKey={NOTICE_KEYS[kind]}
        components={{
          terms: <LegalLink doc="terms" />,
          privacy: <LegalLink doc="privacy" />,
        }}
      />
    </p>
  )
}

/** Both documents side by side — for settings, where there is no sentence. */
export function LegalLinksRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <LegalLink doc="privacy" />
      <span aria-hidden>·</span>
      <LegalLink doc="terms" />
    </div>
  )
}
