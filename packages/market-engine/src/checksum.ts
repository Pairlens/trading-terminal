// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// CRC32 (IEEE 802.3, polynomial 0xEDB88320) over a UTF-8 string.
// Exchanges such as OKX publish a signed-int32 CRC32 of the top orderbook
// levels so clients can detect a corrupted/desynced local book. Returns the
// signed 32-bit result to match those exchange checksums directly.

export function crc32(input: string): number {
  let crc = 0xffffffff
  const bytes = new TextEncoder().encode(input)
  // eslint-disable-next-line @typescript-eslint/prefer-for-of -- hot path: CRC32 runs per orderbook WS message; index loop avoids iterator overhead
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  // `crc ^ 0xffffffff` is evaluated as a signed int32 by JS bitwise semantics,
  // which is exactly the representation OKX (and others) publish.
  return crc ^ 0xffffffff
}
