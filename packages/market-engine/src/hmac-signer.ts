// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
const encoder = new TextEncoder()

/**
 * HMAC-SHA256 signer using Web Crypto API (works in browser + Tauri).
 * Returns base64-encoded signature.
 */
export async function hmacSign(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

/**
 * HMAC-SHA256 signer — returns hex-encoded signature.
 * Used by Binance, ByBit, and MEXC exchanges.
 */
export async function hmacSignHex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
