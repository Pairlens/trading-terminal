// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Skeleton } from '@pairlens/ui/components/ui/skeleton'

export function FeaturedHeroSkeleton() {
  return (
    <div className="relative h-[472px] w-full overflow-hidden rounded-[22px] border border-border">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-card to-card" />
      <div className="relative z-10 flex h-full max-w-[60%] flex-col justify-center px-[52px]">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-5 h-12 w-[420px] max-w-full" />
        <Skeleton className="mt-3 h-12 w-72" />
        <Skeleton className="mt-6 h-4 w-96 max-w-full" />
        <div className="mt-7 flex gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function ShelfSkeleton() {
  return (
    <section className="mt-[34px]">
      <div className="mb-[15px] flex items-baseline gap-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <PosterCardSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}

export function PosterCardSkeleton() {
  return (
    <div className="w-[152px] shrink-0">
      <Skeleton className="h-[188px] w-full rounded-[17px]" />
      <Skeleton className="mt-2 h-3.5 w-24" />
      <Skeleton className="mt-1.5 h-3 w-32" />
    </div>
  )
}
