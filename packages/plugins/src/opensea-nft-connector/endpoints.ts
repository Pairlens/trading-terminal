// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one base URL, in a module both `./http` and `./auth` can import.
 *
 * It lives here rather than in `./http` because `./http` imports `./auth` for
 * the key it sends, and `./auth` needs the same base to mint one. A constant
 * shared by both sides of that edge has to sit below it, or the two modules
 * form a cycle whose evaluation order is up to whichever bundler is running.
 */
export const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2'
