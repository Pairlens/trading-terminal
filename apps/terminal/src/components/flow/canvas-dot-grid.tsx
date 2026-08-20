// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Background, BackgroundVariant, useStore } from '@xyflow/react'

/**
 * The builder canvases' dot grid, at the same weight however far you zoom out.
 *
 * xyflow ties the dot to canvas coordinates rather than to the screen:
 * `radius = size * zoom / 2`. That is right for the gap, which has to travel
 * with the nodes, and wrong for the dot, which is texture. At the zoom a
 * fitted flow lands on (~0.82) a `size={1}` dot is 0.41px across, so it
 * antialiases into almost nothing; anywhere below that the grid is gone and
 * the canvas reads as blank paper. It looked like a light-mode problem and was
 * not: dark loses the grid at exactly the same zoom, it just has more contrast
 * left to lose.
 *
 * Dividing the size by the live zoom cancels xyflow's multiplication, so the
 * dot lands at `DOT_PX` on screen at every zoom while the gap keeps scaling
 * with the content. The lower clamp is what stops a near-zero zoom from
 * dividing its way to an enormous radius.
 *
 * The zoom subscription lives down here rather than in the canvas so a pinch
 * re-renders eleven lines instead of a whole builder. It is not a new
 * subscription either: `<Background>` already reads the same transform, and
 * this selector narrows to `zoom`, so panning no longer wakes it at all.
 */

/** On-screen dot diameter. Below ~1.2px a dot antialiases into the ground. */
const DOT_PX = 1.4

export function CanvasDotGrid({
  color,
  gap = 16,
}: {
  color: string
  gap?: number
}) {
  const zoom = useStore((s) => s.transform[2])

  return (
    <Background
      variant={BackgroundVariant.Dots}
      gap={gap}
      size={DOT_PX / Math.max(zoom, 0.1)}
      color={color}
    />
  )
}
