// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The twelve drawing-tool shapes lucide does not have.
 *
 * Path data is lifted verbatim from `const P = { … }` in
 * `design_handoff_pairlens_mobile/design/Pairlens Mobile Focus.dc.html`,
 * where they were drawn for this design on lucide's 24×24 / stroke-1.7 /
 * round-cap grid so they sit beside real lucide icons without reading as a
 * second icon set.
 *
 * Rule: a glyph may only exist for a shape lucide does not have. Cursor,
 * trend line, horizontal, text, grid, magnet, trash, brush, measure,
 * fibonacci and every non-drawing icon come from `lucide-react`.
 */
import type { SVGProps } from 'react'

export type GlyphName =
  | 'ray'
  | 'vline'
  | 'channel'
  | 'fibExt'
  | 'fibFan'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'arrow'
  | 'callout'
  | 'longPos'
  | 'shortPos'

const PATHS: Record<GlyphName, Array<string>> = {
  ray: ['m7 17 14-14', 'M4.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  vline: ['M12 2v20', 'M9.5 7h5', 'M9.5 17h5'],
  channel: ['M3 17 15 5', 'M9 21 21 9'],
  fibExt: ['M3 5h18', 'M3 11h18', 'M3 17h18', 'M8 2v20'],
  fibFan: ['M3 21 21 3', 'M3 21h18', 'M3 21 21 11', 'M3 21 21 17'],
  rect: ['M3 5h18v14H3z'],
  ellipse: ['M12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7-9 3.13-9 7 4.03 7 9 7Z'],
  triangle: ['M12 4 21 19H3z'],
  arrow: ['M5 19 19 5', 'M19 5h-7', 'M19 5v7'],
  callout: [
    'M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3l4 4v-4h9a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z',
  ],
  longPos: ['M3 9h18v6H3z', 'M12 15v6', 'M12 9V3', 'm9 6 3-3 3 3'],
  shortPos: ['M3 9h18v6H3z', 'M12 15v6', 'M12 9V3', 'm9 18 3 3 3-3'],
}

export type GlyphProps = {
  name: GlyphName
  size?: number
  className?: string
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height' | 'className'>

export function Glyph({ name, size = 20, className, ...rest }: GlyphProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  )
}
