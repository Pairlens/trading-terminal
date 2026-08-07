// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Draggable limit-price line over the chart (design screen 7, blueprint
 * §D.9 — a DOM overlay, deliberately NOT an engine drawing). Owned by WS-C —
 * replace this file's contents; the default export is the contract. Rendered
 * through MobileChartSurface's `overlay` prop at z-20 (above the z-10
 * tap-to-dismiss layer), always mounted: the component itself decides
 * visibility from the order draft store (orderType === 'limit' etc.).
 *
 * Stand-in: renders nothing until WS-C lands.
 */
export default function LimitLineOverlay() {
  return null
}
