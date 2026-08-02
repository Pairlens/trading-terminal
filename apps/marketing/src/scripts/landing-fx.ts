// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Landing choreography CSS can't express on its own, driven by one
// rAF-throttled scroll listener:
//  1. Parallax — `[data-par="N"]` gets `--par-y` from its viewport progress.
//     Elements apply it with the `translate` property, never `transform`, so
//     it composes with the reveal animation instead of fighting it.
//  2. Scroll-lit imagery — `[data-alive]` gets `--alive` 0→1, which feeds the
//     brightness/saturate filter on the hero laptop as it rises into view.
// Idempotent, re-armed on Astro view-transition navigations, and flattened
// under prefers-reduced-motion (no parallax, imagery lit from the start).

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

let raf = 0
let bound = false

function paint() {
  raf = 0
  const vh = window.innerHeight || 900

  for (const el of document.querySelectorAll<HTMLElement>('[data-par]')) {
    const rect = el.getBoundingClientRect()
    const progress = clamp01((vh - rect.top) / (vh + rect.height))
    const amount = Number.parseFloat(el.dataset.par ?? '') || 0
    el.style.setProperty(
      '--par-y',
      `${((progress - 0.5) * amount).toFixed(2)}px`,
    )
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-alive]')) {
    const rect = el.getBoundingClientRect()
    const lit = clamp01((vh * 0.96 - rect.top) / (vh * 0.5))
    el.style.setProperty('--alive', lit.toFixed(3))
  }
}

function queue() {
  if (raf) return
  raf = requestAnimationFrame(paint)
}

function release() {
  if (!bound) return
  bound = false
  window.removeEventListener('scroll', queue)
  window.removeEventListener('resize', queue)
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function flatten() {
  release()
  for (const el of document.querySelectorAll<HTMLElement>('[data-par]')) {
    el.style.removeProperty('--par-y')
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-alive]')) {
    el.style.setProperty('--alive', '1')
  }
}

// Touch scrolling delivers scroll events in bursts (momentum settles before
// the handler fires), so scroll-driven motion lands in visible steps instead
// of gliding — on phones it reads as layout shifts. Flatten it there and keep
// the choreography for fine-pointer devices.
const coarse = window.matchMedia('(pointer: coarse)')

function arm() {
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    coarse.matches
  ) {
    flatten()
    return
  }
  if (!bound) {
    bound = true
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue, { passive: true })
  }
  paint()
}

arm()
coarse.addEventListener('change', arm)
document.addEventListener('astro:page-load', arm)
document.addEventListener('astro:before-swap', release)
