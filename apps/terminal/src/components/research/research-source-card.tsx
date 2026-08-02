// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ExternalLink } from 'lucide-react'

type SourceCardProps = {
  url: string
  title: string
  index?: number
}

export function ResearchSourceCard({ url, title, index }: SourceCardProps) {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    hostname = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border border-border/50 bg-muted/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/60"
    >
      {index != null && (
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-medium text-primary">
          {index}
        </span>
      )}
      <img
        src={faviconUrl}
        alt=""
        className="size-4 shrink-0 rounded"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextElementSibling?.classList.remove('hidden')
        }}
      />
      <ExternalLink className="hidden size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-primary">
        {title}
      </span>
      <span className="shrink-0 truncate text-[11px] text-muted-foreground">
        {hostname}
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  )
}
