// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SectionEyebrow } from '../store/store-shell'

// ---------------------------------------------------------------------------
// Section header — storefront eyebrow style shared with the Plugin and
// Workspace stores (mono uppercase label + faint count + description).
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  description,
  count,
  action,
}: {
  title: string
  description: string
  count: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-2.5">
          <SectionEyebrow>{title}</SectionEyebrow>
          {count > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground/60">
              {count}
            </span>
          )}
        </div>
        <p className="mt-1.5 max-w-[62ch] text-xs leading-relaxed text-muted-foreground/80">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
