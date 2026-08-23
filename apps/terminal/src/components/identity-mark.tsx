// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A picture when there is one, and a mark of its own when there is not.
 *
 * Deliberately generic and deliberately outside `components/memecoins/`: the
 * memecoin board is only where the problem was loudest. A launchpad icon is a
 * user-supplied IPFS URL and a fair share of them 404, so that board always has
 * anonymous rows — but a DEX pool with no logo, an unlisted NFT collection and
 * a prediction outcome all land in the same place, and they should all land on
 * the same mark rather than on three near-identical fallbacks.
 *
 * The gradient itself and the reasoning behind it live in
 * `lib/identity-gradient.ts`. What this file adds is the two behaviours a
 * fallback needs to be usable in a table: the image is only trusted until it
 * fails, and the failure is silent. `onError` swaps to the gradient rather than
 * leaving a broken-image glyph, and `referrerPolicy` is set because these URLs
 * point at hosts we have no relationship with.
 */
import { useState } from 'react'

import { cn } from '@pairlens/ui/lib/utils'

import { identityGradient, identityInitials } from '@/lib/identity-gradient'

export function IdentityMark({
  /** What the mark is FOR. Decides the gradient and the letters. */
  name,
  /**
   * A stabler identity than the name, when the caller has one.
   *
   * A memecoin's identity is its mint, and two tokens called TIMBOTHY are two
   * different tokens: seeding on the address gives them different chips, which
   * is the honest answer. Falls back to the name.
   */
  seed,
  imageUrl,
  className,
  /** Letters shown when there is no image. Two is right for a 16px chip. */
  initials = 2,
}: {
  name: string
  seed?: string | null
  imageUrl?: string | null
  className?: string
  initials?: number
}) {
  const [failed, setFailed] = useState(false)
  const showImage = !!imageUrl && !failed
  const gradient = identityGradient(seed || name)

  return (
    <span
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-semibold uppercase leading-none',
        className,
      )}
      // The gradient is painted even under an image that has not failed yet:
      // an IPFS icon can take a second, and a grey hole is a worse first frame
      // than the mark the row will keep if the icon never arrives.
      style={gradient}
    >
      {identityInitials(name, initials)}
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  )
}
