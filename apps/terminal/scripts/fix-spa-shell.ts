// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Repair the per-route asset links baked into the SPA shell.
//
// TanStack Router emits the assets of every route the current URL matched:
// a `<link rel="modulepreload">` per script chunk, and a
// `<link rel="stylesheet" type="text/css">` per style chunk. Under SSR that is
// right, because each response carries the assets for the page it is. In SPA
// mode there is ONE `_shell.html`, prerendered at `spa.maskPath` (default `/`)
// and then served for every URL (see `vercel.json`, and the Tauri bundle,
// which both answer every path with this file), so the list it carries
// describes one route and is wrong for all the others. The two kinds are wrong
// in opposite directions, so they get opposite treatment.
//
// PRELOADS ARE DROPPED. Measured on this app: 163 preloads baked from `/`,
// which made `/onboarding` fetch 180 chunks / 7.2 MB instead of 51 chunks /
// 6.1 MB. The terminal layout, the plugin provider and the assistant dock all
// came down before a first-run visitor had picked a language. Cost of dropping
// them is one extra round trip to discover the route chunk after `main` runs;
// `main` itself is a script tag and needs no preload.
//
// STYLESHEETS ARE COMPLETED TO THE UNION. Dropping them instead breaks
// hydration: React treats a `<link rel="stylesheet">` in `<head>` as a
// hoistable resource keyed by href, and a route whose CSS chunk is NOT already
// in the document renders one during the hydration pass — which React cannot
// reconcile, so it tears the whole tree down with a mismatch and logs it. `/`
// bakes `use-sign-in-flow-*.css`, so `/onboarding` failed on its own
// `onboarding-*.css` whether the baked link was left in place (wrong href) or
// removed (no href). `/bots`, which contributes no CSS of its own, was fine
// either way. Linking every style chunk fixes all of them at once: the set a
// route renders is then always a subset of what the document already has, and
// a superset in `<head>` is what React tolerates. It is also the honest shape
// for one shell serving every path. The whole union is small (four chunks,
// ~19 KB here) because the app's real CSS is the single Tailwind entry the
// root route links through `head()`, and that one is on every page already.
//
// Setting `maskPath` to a route with a smaller graph is not a fix for either
// half: the prerenderer fetches that path and fails on a 404, and any real
// route bakes in ITS assets for everyone else.
//
// Runs after `vite build` (see the `build:internal` script), because the shell
// is written by the prerender pass at the very end of the build, after every
// Vite plugin hook has already fired.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const CLIENT_DIR = new URL('../dist/client/', import.meta.url)
const SHELL = new URL('_shell.html', CLIENT_DIR)

const PRELOAD_LINK = /<link rel="modulepreload"[^>]*>/g
/** Route stylesheets carry `type`; the app's own, from `head()`, does not. */
const ROUTE_STYLESHEET_LINK =
  /<link rel="stylesheet"[^>]*type="text\/css"[^>]*>/g
const APP_STYLESHEET_LINK = /<link rel="stylesheet" href="([^"]+)"\s*\/>/

const html = readFileSync(SHELL, 'utf8')

const preloads = html.match(PRELOAD_LINK)?.length ?? 0
if (preloads === 0) {
  // Either the router stopped baking preloads or the markup changed shape.
  // Not fatal — the build is still correct, just heavier than it should be —
  // but it should be loud, because the regression is invisible otherwise.
  console.warn(
    '[shell] no modulepreload links found; the shell may have changed shape',
  )
}

const appSheet = html.match(APP_STYLESHEET_LINK)
if (!appSheet) {
  // Without it every page paints unstyled, and the union below has no anchor
  // and no way to work out where the assets live.
  throw new Error(
    '[shell] no app stylesheet link found in the prerendered shell',
  )
}
const [appSheetTag, appSheetHref] = appSheet as unknown as [string, string]
const assetDir = appSheetHref.slice(0, appSheetHref.lastIndexOf('/'))

const styleChunks = readdirSync(new URL(`.${assetDir}/`, CLIENT_DIR))
  .filter((file) => file.endsWith('.css'))
  .map((file) => `${assetDir}/${file}`)
  .filter((href) => href !== appSheetHref)
  .sort()

const union = styleChunks
  .map((href) => `<link rel="stylesheet" href="${href}" type="text/css"/>`)
  .join('')

const fixed = html
  .replace(PRELOAD_LINK, '')
  .replace(ROUTE_STYLESHEET_LINK, '')
  .replace(appSheetTag, appSheetTag + union)

writeFileSync(SHELL, fixed)
console.log(
  `[shell] dropped ${preloads} baked modulepreload links, linked ${styleChunks.length} style chunks`,
)
