// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase Advanced Trade JWT signer (ES256).
 *
 * Coinbase uses ECDSA P-256 (ES256) JWT tokens for authentication — NOT HMAC.
 * Supports both SEC1 (-----BEGIN EC PRIVATE KEY-----) and
 * PKCS#8 (-----BEGIN PRIVATE KEY-----) PEM formats.
 *
 * Each JWT has a 120-second lifetime. Generate a fresh one per request.
 */

// ── DER encoding helpers ──

function encodeDerLength(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len])
  if (len < 256) return new Uint8Array([0x81, len])
  return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff])
}

function wrapDer(tag: number, content: Uint8Array): Uint8Array {
  const lenBytes = encodeDerLength(content.length)
  const result = new Uint8Array(1 + lenBytes.length + content.length)
  result[0] = tag
  result.set(lenBytes, 1)
  result.set(content, 1 + lenBytes.length)
  return result
}

function concatBytes(...arrays: Array<Uint8Array>): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

// PKCS#8 wrapping components for EC P-256
const PKCS8_VERSION = new Uint8Array([0x02, 0x01, 0x00])
const EC_P256_ALGO_ID = new Uint8Array([
  0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
])

/** Convert SEC1 EC private key DER → PKCS#8 DER for Web Crypto import. */
function sec1ToPkcs8(sec1: Uint8Array): Uint8Array {
  const octetString = wrapDer(0x04, sec1)
  const inner = concatBytes(PKCS8_VERSION, EC_P256_ALGO_ID, octetString)
  return wrapDer(0x30, inner)
}

// ── Base64 helpers ──

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64urlEncode(input: string | Uint8Array): string {
  let b64: string
  if (typeof input === 'string') {
    b64 = btoa(input)
  } else {
    let binary = ''
    for (const b of input) binary += String.fromCharCode(b)
    b64 = btoa(binary)
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Key import with caching ──

let _cachedPem = ''
let _cachedKey: CryptoKey | null = null

async function getSigningKey(pem: string): Promise<CryptoKey> {
  if (_cachedKey && _cachedPem === pem) return _cachedKey

  const isSec1 = pem.includes('BEGIN EC PRIVATE KEY')
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  const der = base64Decode(b64)
  const pkcs8 = isSec1 ? sec1ToPkcs8(der) : der

  _cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  _cachedPem = pem
  return _cachedKey
}

// ── JWT creation ──

/**
 * Create a Coinbase Advanced Trade JWT (ES256).
 *
 * @param apiKey    - CDP API key name (e.g. "organizations/.../apiKeys/...")
 * @param apiSecret - EC private key in PEM format
 * @param method    - HTTP method (omit for WebSocket JWT)
 * @param path      - Request path including prefix (omit for WebSocket JWT)
 */
export async function createCoinbaseJwt(
  apiKey: string,
  apiSecret: string,
  method?: string,
  path?: string,
): Promise<string> {
  const key = await getSigningKey(apiSecret)

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', typ: 'JWT', kid: apiKey, nonce }

  const payload: Record<string, unknown> = {
    sub: apiKey,
    iss: 'cdp',
    aud: ['cdp_service'],
    nbf: now,
    exp: now + 120,
  }

  // REST JWT includes URI claim; WebSocket JWT omits it
  if (method && path) {
    payload['uri'] = `${method.toUpperCase()} api.coinbase.com${path}`
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const sigInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    sigInput,
  )

  const sigB64 = base64urlEncode(new Uint8Array(sig))
  return `${headerB64}.${payloadB64}.${sigB64}`
}
