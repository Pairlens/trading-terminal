// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Drop the baked `<link rel="modulepreload">` list from the SPA shell.
//
// TanStack Router emits a modulepreload per asset of every route the current
// URL matched. Under SSR that is right: each response carries the preloads for
// the page it is. In SPA mode there is ONE `_shell.html`, prerendered at
// `spa.maskPath` (default `/`) and then served for every URL, so the list it
// carries describes one route and is wrong for all the others.
//
// Measured on this app: 163 preloads baked from `/`, which made `/onboarding`
// fetch 180 chunks / 7.2 MB instead of 51 chunks / 6.1 MB. The terminal
// layout, the plugin provider and the assistant dock all came down before a
// first-run visitor had picked a language.
//
// Setting `maskPath` to a route with a smaller graph is not a fix: the
// prerenderer fetches that path and fails on a 404, and any real route bakes
// in ITS assets for everyone else. The honest answer for a one-shell SPA is to
// bake nothing and let each route pull its own chunk, which is what the route
// splitting already does. Cost is one extra round trip to discover the route
// chunk after `main` runs; `main` itself is a script tag and needs no preload,
// and the stylesheet is a `rel="stylesheet"` link this leaves alone.
//
// Runs after `vite build` (see the `build:internal` script), because the shell
// is written by the prerender pass at the very end of the build, after every
// Vite plugin hook has already fired.
import { readFileSync, writeFileSync } from 'node:fs'

const SHELL = new URL('../dist/client/_shell.html', import.meta.url)

const html = readFileSync(SHELL, 'utf8')
const stripped = html.replace(/<link rel="modulepreload"[^>]*>/g, '')

const removed =
  (html.match(/rel="modulepreload"/g)?.length ?? 0) -
  (stripped.match(/rel="modulepreload"/g)?.length ?? 0)

if (removed === 0) {
  // Either the router stopped baking preloads or the markup changed shape.
  // Not fatal — the build is still correct, just heavier than it should be —
  // but it should be loud, because the regression is invisible otherwise.
  console.warn(
    '[shell] no modulepreload links found; the shell may have changed shape',
  )
} else {
  writeFileSync(SHELL, stripped)
  console.log(`[shell] stripped ${removed} baked modulepreload links`)
}
