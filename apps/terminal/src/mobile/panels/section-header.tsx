// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The heading that opens a Discover section, with an optional link on the
 * right ("All pairs", "All events").
 *
 * It lives in its own file rather than inside `discover-panel` because a
 * section that can gate ITSELF off (predictions, when no venue is installed)
 * has to own its heading — a header rendered by the panel would leave a title
 * standing over nothing.
 */
import { PRESS } from '../primitives/press'

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-5">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {action && onAction ? (
        <button
          className="pl-hit-44 pl-press-text shrink-0 text-[12px] font-medium text-primary"
          onClick={onAction}
          type="button"
          {...PRESS}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}
