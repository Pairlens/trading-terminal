// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Copy for /licensing. Shared between the page (FAQ structured data) and the
// section components. Wording is deliberate: the licence is "source-available"
// until a release converts, never "open source".

export const GLANCE = [
  { k: 'Licence', v: 'FSL-1.1-Apache-2.0' },
  { k: 'Cost, any company size', v: '$0' },
  { k: 'Converts to Apache 2.0', v: 'after 2 years' },
  { k: 'Charting engine', v: 'MIT, today' },
] as const

export const CLAUSES = [
  {
    n: 'I',
    title: 'You may use it, for anything but competing with it.',
    body: 'Trade with it, deploy it across a fund, modify it, self-host it, teach with it, research with it, and sell services around it. The one excluded purpose is a commercial product or service that substitutes for Pairlens.',
    cite: '“Permitted Purpose” covers any purpose other than providing a competing product or service.',
  },
  {
    n: 'II',
    title: 'It costs nothing, at any company size.',
    body: 'No tiers, no seat counts, no paid features hidden in the code. The only paid thing we offer is the optional hosted Intelligence subscription, which is a convenience and never a gate.',
    cite: 'No fee provision exists in the licence at all.',
  },
  {
    n: 'III',
    title: 'Every release becomes Apache 2.0 after two years.',
    body: 'An irrevocable grant, already written into the text. If Pairlens is acquired, abandoned, or changes direction, the code you depend on is permanently free and forkable.',
    cite: '“Future License”: Apache 2.0, effective on the second anniversary of the release.',
  },
  {
    n: 'IV',
    title: 'We cannot use patents against you.',
    body: 'The FSL grants a patent license for your permitted use today, and the Apache 2.0 conversion carries Apache’s well-known patent grant, the reason large institutions trust it. Compliance review tends to be short.',
    cite: 'Patent licence granted under both the FSL and the Apache 2.0 future licence.',
  },
] as const

export const FAQ = [
  {
    q: 'Is Pairlens free?',
    a: 'Yes. The terminal costs nothing, for individuals and companies alike. There are no license tiers, no seat counts, and no paid features hidden in the code. The only paid thing we offer is the optional hosted Intelligence subscription, which is a convenience, never a gate.',
  },
  {
    q: 'Is Pairlens open source?',
    a: 'The precise term is source-available, sometimes called Fair Source. All the code is public on GitHub and you can use, modify, and self-host it freely. The one restriction (no competing commercial resale) means it doesn’t meet the strict open-source definition for its first two years. After that, each release converts to Apache 2.0, which is full open source by any definition.',
  },
  {
    q: 'Why not just use MIT for everything?',
    a: 'Our whole point is to be the free, transparent alternative to the big trading platforms. Under MIT, any of them could take the code, wrap it in their branding, and sell it back to you as a closed product, using our own work to outspend us. The FSL blocks exactly that move and nothing else. We don’t need protection from you, we need it from them.',
  },
  {
    q: 'Can my company or fund use Pairlens internally?',
    a: 'Yes, expressly. The FSL names internal use and access as a permitted purpose, so deploying Pairlens across a trading desk, a fund, or an entire company needs no license fee and no negotiation. Combined with the patent grants, that tends to make compliance review short.',
  },
  {
    q: 'What does the two-year conversion actually guarantee me?',
    a: 'The license includes an irrevocable grant: two years after a release ships, that release is licensed to you under Apache 2.0. It isn’t a promise we might keep, it’s already in the license text. If Pairlens the project ever disappears, gets acquired, or changes direction, every release older than two years is permanently free and forkable.',
  },
  {
    q: 'What license is the charting engine under?',
    a: 'Fast Financial Charts, our WebGL2 charting engine, lives in its own repository under plain MIT, commercial use included, no two-year wait. Use it in any app today.',
  },
] as const
