// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Timing helpers for the connector test suites.

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Poll until cond() holds, bailing after timeoutMs so a genuine failure still
 * lands on the assertion that follows.
 *
 * POSITIVE expectations — "the login frame went out", "a second socket
 * opened" — must wait like this. A fixed sleep sized to the tiny backoffs
 * these tests configure is really a bet that the machine is idle: signing an
 * HMAC or resolving a reconnect takes microseconds on a quiet laptop and
 * comfortably longer than 5ms on a loaded CI runner, where the bet is lost and
 * the suite reports a flake.
 *
 * NEGATIVE assertions — "nothing reconnected", "no subscribe went out during
 * this window" — keep their fixed sleeps. There is no event to wait for, and a
 * stall only widens the window the claim has to survive, which makes those
 * tests stricter rather than flakier.
 */
export const waitFor = async (cond: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!cond() && Date.now() < deadline) await sleep(2)
}
