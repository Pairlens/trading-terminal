// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * DexPaprika's identity in the shared throttle registry.
 *
 * No limiter here, unlike the GeckoTerminal transport: this provider is
 * CORS-blocked in a browser and only reachable from desktop and the CLI, where
 * it is the priority-6 fallback rather than the surface every DEX pane polls.
 * What it does share is the CLASSIFICATION, so a 429 from either provider means
 * the same thing to the terminal: retry, not "this pair does not exist here".
 */
export const DEXPAPRIKA_PROVIDER = 'DexPaprika'
