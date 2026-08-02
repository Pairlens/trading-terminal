// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ExternalLink } from 'lucide-react'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@pairlens/ui/components/ui/hover-card'

type InlineCitationProps = {
  url: string
  title: string
  index: number
}

export function ResearchInlineCitation({
  url,
  title,
  index,
}: InlineCitationProps) {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    hostname = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`

  return (
    <HoverCard>
      <HoverCardTrigger
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-0.5 inline-flex size-[18px] items-center justify-center rounded bg-primary/15 align-super text-[10px] font-medium leading-none text-primary no-underline transition-colors hover:bg-primary/25"
      >
        {index}
      </HoverCardTrigger>
      <HoverCardContent side="top" sideOffset={6} className="w-72 p-0">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2.5 rounded-lg p-3 transition-colors hover:bg-muted/40"
        >
          <img
            src={faviconUrl}
            alt=""
            className="mt-0.5 size-4 shrink-0 rounded"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <ExternalLink className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-medium text-foreground group-hover:text-primary">
              {title}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {hostname}
            </p>
          </div>
          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </a>
      </HoverCardContent>
    </HoverCard>
  )
}
