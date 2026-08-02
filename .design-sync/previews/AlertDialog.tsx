// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui'

const freeze = `
[data-slot='alert-dialog-content']{animation:none !important;transform:translate(-50%,-50%) !important;opacity:1 !important;}
[data-slot='alert-dialog-overlay']{animation:none !important;opacity:1 !important;}
`

export const CloseAllPositions = () => (
  <div style={{ padding: 16, minHeight: 360 }}>
    <style>{freeze}</style>
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close all positions?</AlertDialogTitle>
          <AlertDialogDescription>
            This market-sells all 4 open positions on OKX (BTC/USDT, ETH/USDT,
            SOL/USDT, LINK/USDT) — about $42,180 in notional. Live orders route
            immediately and this cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">
            Close all positions
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
)
