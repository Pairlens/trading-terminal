// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//
// The corner shape every Pairlens app icon is cut with. It lives here rather
// than in one of the two generator scripts because both cut with it, and two
// copies that drifted apart would ship a Windows tile and a PWA icon with
// visibly different corners.

// Rounded rectangle whose corners follow a superellipse quarter-arc instead of
// a circular one — straight edges (Windows 11 house style) with the continuous
// curvature that makes the corner read as a squircle rather than a filleted
// box. RADIUS_RATIO is the corner radius as a fraction of the edge; EXPONENT
// is the superellipse `n` (2 would be a plain circular arc, higher pushes the
// curve out towards the square corner).
const RADIUS_RATIO = 0.225
const EXPONENT = 4.5
const ARC_STEPS = 96

export function squirclePath(size: number): string {
  const r = size * RADIUS_RATIO
  // Top-left corner arc, from the left edge (0, r) round to the top edge (r, 0).
  const corner: Array<[number, number]> = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = (i / ARC_STEPS) * (Math.PI / 2)
    const x = r - r * Math.cos(t) ** (2 / EXPONENT)
    const y = r - r * Math.sin(t) ** (2 / EXPONENT)
    corner.push([x, y])
  }

  const n = (v: number) => Number(v.toFixed(3))
  const pts: Array<[number, number]> = []
  // Clockwise: TL arc, top edge, TR arc, right edge, BR arc, bottom, BL arc.
  for (const [x, y] of corner) pts.push([x, y])
  for (const [x, y] of [...corner].reverse()) pts.push([size - x, y])
  for (const [x, y] of corner) pts.push([size - x, size - y])
  for (const [x, y] of [...corner].reverse()) pts.push([x, size - y])

  const [first, ...rest] = pts
  return (
    `M ${n(first[0])} ${n(first[1])} ` +
    rest.map(([x, y]) => `L ${n(x)} ${n(y)}`).join(' ') +
    ' Z'
  )
}

export function squircleMask(size: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<path d="${squirclePath(size)}" fill="#ffffff"/>` +
      `</svg>`,
  )
}
