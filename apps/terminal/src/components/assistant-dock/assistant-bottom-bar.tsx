// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The orb, in a strip under the terminal ───────────────────────────
//
// Floating, without the overlap. The orb keeps the same bottom-right
// corner it has when floating, so switching between the two placements
// does not move it, and the suggestion stays readable the whole time
// rather than waiting for a hover. What changes is what is underneath:
// the shell pads itself by this strip's height, so the bar sits BESIDE
// the workspace the way the nav rail does instead of parking a pill on
// top of whatever pane owns that corner.
//
// The strip runs the full width but only the pill takes clicks. The
// rest stays inert so a chat window dragged down here is still the
// thing you hit.

import { cn } from '@pairlens/ui'

import { AssistantOrbButton } from './assistant-orb-button'
import type { AssistantOrbButtonProps } from './assistant-orb-button'
import { ASSISTANT_BAR } from '@/lib/assistant-core/placement'

export function AssistantBottomBar(
  props: Omit<AssistantOrbButtonProps, 'variant'>,
) {
  return (
    <div
      data-assistant-bar=""
      className={cn(
        // Below the chat window's z-40 on purpose: drag the window down
        // here and it should cover the bar, not duck under it.
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-end px-4',
        ASSISTANT_BAR.height,
      )}
    >
      <div className="pointer-events-auto">
        <AssistantOrbButton {...props} variant="bar" />
      </div>
    </div>
  )
}
