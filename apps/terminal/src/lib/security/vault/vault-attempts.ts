// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The vault shares the terminal lock's attempt counter — one backoff, one
 * lockout, one place to reason about brute force. A separate counter would
 * mean five free guesses per prompt and a trivial way to double your budget.
 *
 * It also means fumbling the vault password delays the screen unlock for up
 * to five minutes. That is intended, and the UI has to say so or it reads as
 * a bug.
 *
 * This re-export exists so the coupling has exactly one edge: `lock-store`
 * drags the settings dialog and analytics behind it, and a test that only
 * wants to watch the counter should not have to load either.
 */

export { blockedForMs, clearAttempts, recordFailedAttempt } from '../lock-store'
