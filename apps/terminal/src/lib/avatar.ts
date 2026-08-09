// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the avatar endpoint accepts, stated once.
 *
 * Both shells upload through `api.uploadAvatar` and both have to refuse an
 * oversized or wrong-typed file locally — the phone especially, where a photo
 * straight off the camera roll is routinely a 12MB HEIC and the round trip
 * that would reject it is expensive. So the limits are a module, not a pair of
 * constants inside whichever surface happened to need them first.
 */

/** Server-side cap on the uploaded file. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

/** `accept` for a file input restricted to the types above. */
export const AVATAR_ACCEPT = Array.from(ALLOWED_IMAGE_TYPES).join(',')
