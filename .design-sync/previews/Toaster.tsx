// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { Toaster, toast } from '@pairlens/ui'

// Both `Toaster` and `toast` come from the DS bundle (the prebuild re-exports
// sonner's `toast` on the bundle), so they share one sonner ToastState store and
// the toast actually renders on the mounted <Toaster>. The frozen capture clock
// freezes sonner's entrance animation, so we force the toast visible below.
const forceVisible = (
  <style>{`
    [data-sonner-toaster]{position:static!important;transform:none!important;inset:auto!important;width:356px!important;max-width:100%!important;height:auto!important}
    [data-sonner-toast]{position:relative!important;opacity:1!important;transform:none!important;visibility:visible!important;pointer-events:auto!important;margin-bottom:8px!important}
    [data-sonner-toast] > *{opacity:1!important}
  `}</style>
)

export const OrderFilled = () => {
  useEffect(() => {
    toast.success('Order filled: 0.25 BTC', {
      id: 'order-filled',
      description: 'Market buy on OKX at 68,240.50 USDT',
      duration: Infinity,
    })
  }, [])
  return (
    <div style={{ padding: 16 }}>
      {forceVisible}
      <Toaster position="top-center" expand />
    </div>
  )
}

export const SignalBreakout = () => {
  useEffect(() => {
    toast.info('Signal: ETH breakout', {
      id: 'eth-breakout',
      description: '4h close above 3,610 — co-pilot rates APPROVE',
      duration: Infinity,
    })
  }, [])
  return (
    <div style={{ padding: 16 }}>
      {forceVisible}
      <Toaster position="top-center" expand />
    </div>
  )
}
