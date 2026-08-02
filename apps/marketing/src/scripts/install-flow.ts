// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The /install download moment. Every release anchor on the page (the OS
// tiles and the big CTA) already downloads directly; this module makes the
// click feel like an arrival: a confetti burst from the pointer, the chooser
// hands the hero over to a "download started" card, and the page glides down
// to the three install steps. A back control restores the chooser. Selection
// state itself (tiles, subs, step panels) stays with the inline script in
// pages/install.astro — this only stages the celebration around it.
import confetti from 'canvas-confetti'

// Warm Precision: iris leads, warm paper and graphite carry.
const CONFETTI_COLORS = ['#6366f1', '#a5b4fc', '#292524', '#e7e5e4', '#f5d565']

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function burst(x: number, y: number) {
  const origin = {
    x: x / window.innerWidth,
    y: y / window.innerHeight,
  }
  // A pop where the click landed…
  confetti({
    particleCount: 80,
    spread: 75,
    startVelocity: 34,
    scalar: 0.9,
    ticks: 140,
    origin,
    colors: CONFETTI_COLORS,
    disableForReducedMotion: true,
  })
  // …and cannons from both viewport edges so the moment fills the screen.
  const cannon = (originX: number, angle: number) =>
    confetti({
      particleCount: 70,
      angle,
      spread: 65,
      startVelocity: 58,
      scalar: 1,
      ticks: 170,
      origin: { x: originX, y: 0.65 },
      colors: CONFETTI_COLORS,
      disableForReducedMotion: true,
    })
  cannon(0, 60)
  cannon(1, 120)
  // Two follow-up volleys keep it raining instead of one thin puff.
  window.setTimeout(() => {
    cannon(0, 55)
    cannon(1, 125)
  }, 180)
  window.setTimeout(() => {
    cannon(0, 68)
    cannon(1, 112)
  }, 380)
}

function startedFlow(page: Element, anchor: HTMLAnchorElement, ev: MouseEvent) {
  const os =
    anchor.getAttribute('data-os') ??
    page.querySelector('[data-os-name]')?.textContent?.trim() ??
    'your system'

  const osLabel = page.querySelector('[data-dl-os]')
  if (osLabel) osLabel.textContent = os
  const retry = page.querySelector<HTMLAnchorElement>('[data-dl-retry]')
  if (retry) retry.href = anchor.href

  // Keyboard activations land at (0,0) — burst from the anchor instead.
  const rect = anchor.getBoundingClientRect()
  const x = ev.clientX || rect.left + rect.width / 2
  const y = ev.clientY || rect.top + rect.height / 2
  burst(x, y)

  page.classList.add('is-downloaded')

  // Let the card land first, then carry the reader to their steps.
  window.setTimeout(
    () => {
      document
        .querySelector('.ins-after')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
    },
    reducedMotion() ? 0 : 700,
  )
}

declare global {
  interface Window {
    __plInstallFlowBound?: boolean
  }
}

// Document-level delegation survives ClientRouter page swaps; the flag keeps
// a second module evaluation from double-binding.
if (!window.__plInstallFlowBound) {
  window.__plInstallFlowBound = true
  document.addEventListener('click', (ev) => {
    if (!(ev.target instanceof Element)) return
    const page = document.querySelector('[data-install-page]')
    if (!page) return

    const back = ev.target.closest('[data-dl-back]')
    if (back) {
      page.classList.remove('is-downloaded')
      document
        .querySelector('.ins-hero')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
      return
    }

    const anchor = ev.target.closest<HTMLAnchorElement>('a[data-os-download]')
    if (anchor) startedFlow(page, anchor, ev)
  })
}
