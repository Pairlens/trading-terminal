// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The `CcxtUrlContext` values the URL hooks are driven with in tests.
 *
 * Not a `*.test.ts` file on purpose — bun collects those and this one has no
 * assertions of its own. It exists so a venue test never has to guess what an
 * instance is: the exchange host builds a PUBLIC one for market data and an
 * AUTHED one per credential slot, and on OKX those two route to different
 * origins from the same country.
 */

import type { CcxtUrlContext } from '../types'

/** The market-data instance: never signs, may take a CORS fallback host. */
export const PUBLIC_CTX: CcxtUrlContext = { authed: false, paper: false }

/** A live credential slot: signs, and must stay on the regional entity. */
export const AUTHED_CTX: CcxtUrlContext = { authed: true, paper: false }

/** A paper credential slot — what `applyPaperUrls` is handed. */
export const AUTHED_PAPER_CTX: CcxtUrlContext = { authed: true, paper: true }

/** A public instance pointed at the sandbox (rare; ByBit paper market data). */
export const PUBLIC_PAPER_CTX: CcxtUrlContext = { authed: false, paper: true }
