// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from '@pairlens/ui'

export const OrderConfirm = () => (
  <div style={{ padding: 16, minHeight: 320 }}>
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm market order</DialogTitle>
          <DialogDescription>
            Buy 0.25 BTC at market on OKX. This routes a live order using your
            connected keys.
          </DialogDescription>
        </DialogHeader>
        <div style={{ fontSize: 14, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Est. cost</span>
            <span>$17,207.63</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Fee</span>
            <span>$8.60</span>
          </div>
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            }
          />
          <Button size="sm">Place order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
