// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  Button,
  Separator,
} from '@pairlens/ui'

const freeze = `
[data-slot='drawer-content'],[vaul-drawer]{animation:none !important;transform:none !important;transition:none !important;opacity:1 !important;}
[data-slot='drawer-overlay'],[vaul-overlay]{animation:none !important;opacity:1 !important;}
`

export const QuickTrade = () => (
  <div style={{ padding: 16, minHeight: 460 }}>
    <style>{freeze}</style>
    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>ETH/USDT — Quick trade</DrawerTitle>
          <DrawerDescription>
            Binance · Spot · Buy signal APPROVED by co-pilot
          </DrawerDescription>
        </DrawerHeader>
        <div style={{ display: 'grid', gap: 10, padding: '0 16px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Mark price</span>
            <span>$3,482.10</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Size</span>
            <span>1.50 ETH</span>
          </div>
          <Separator />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Est. total</span>
            <span style={{ color: 'var(--chart-2)' }}>$5,223.15</span>
          </div>
        </div>
        <DrawerFooter>
          <Button>Confirm buy</Button>
          <DrawerClose render={<Button variant="outline">Cancel</Button>} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)
