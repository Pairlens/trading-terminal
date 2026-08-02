// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Scroll-reveal: content is server-rendered visible (SEO / no-JS safe); once
// this runs we flag the root so CSS can hide `[data-reveal]` nodes, then an
// IntersectionObserver rises them in as they enter the viewport. A synchronous
// pass reveals anything already in view so above-the-fold content never waits.
// Idempotent and re-armed on every Astro view-transition navigation.

const REVEAL_READY = 'reveal-ready'

function reveal(el: HTMLElement) {
  const delay = el.dataset.revealDelay
  if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`)
  el.classList.add('is-revealed')
}

function inViewport(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  return r.top < vh * 0.92 && r.bottom > 0
}

function armReveals() {
  // Reduced motion, and every touch device: phones pay twice for the reveal —
  // below-fold choreography reads as content failing to load, and the hidden
  // state's `will-change` promotes dozens of elements to GPU layers, which
  // stutters mobile scrolling. Render everything outright instead.
  const flat =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    window.matchMedia('(pointer: coarse)').matches

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-revealed)'),
  )
  if (nodes.length === 0) return

  if (flat) {
    for (const node of nodes) node.classList.add('is-revealed')
    return
  }

  // Flag the root so the "hidden" start state applies only with JS present.
  document.documentElement.classList.add(REVEAL_READY)

  // Reveal anything already in view right now (reliable, no observer latency).
  for (const node of nodes) {
    if (inViewport(node)) reveal(node)
  }

  const remaining = nodes.filter((n) => !n.classList.contains('is-revealed'))
  if (remaining.length === 0) return

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        reveal(entry.target as HTMLElement)
        obs.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )
  for (const node of remaining) observer.observe(node)
}

armReveals()
document.addEventListener('astro:page-load', armReveals)
