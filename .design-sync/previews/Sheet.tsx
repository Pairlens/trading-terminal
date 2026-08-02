// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  Button,
  Label,
  Input,
  ToggleGroup,
  ToggleGroupItem,
  Separator,
} from '@pairlens/ui'

const freeze = `
[data-slot='sheet-content']{animation:none !important;transform:none !important;opacity:1 !important;transition:none !important;}
[data-slot='sheet-overlay']{animation:none !important;opacity:1 !important;}
`

export const OrderForm = () => (
  <div style={{ padding: 16, minHeight: 460 }}>
    <style>{freeze}</style>
    <Sheet defaultOpen>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>New order — BTC/USDT</SheetTitle>
          <SheetDescription>OKX · Spot · Last 68,430.55</SheetDescription>
        </SheetHeader>
        <div style={{ display: 'grid', gap: 14, padding: '0 16px' }}>
          <ToggleGroup type="single" defaultValue="buy" variant="outline">
            <ToggleGroupItem value="buy" style={{ flex: 1 }}>
              Buy
            </ToggleGroupItem>
            <ToggleGroupItem value="sell" style={{ flex: 1 }}>
              Sell
            </ToggleGroupItem>
          </ToggleGroup>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label htmlFor="sheet-price">Limit price</Label>
            <Input id="sheet-price" defaultValue="68,250.00" />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label htmlFor="sheet-size">Size (BTC)</Label>
            <Input id="sheet-size" defaultValue="0.25" />
          </div>
          <Separator />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
            }}
          >
            <span style={{ color: 'var(--muted-foreground)' }}>
              Order value
            </span>
            <span>$17,062.50</span>
          </div>
        </div>
        <SheetFooter>
          <Button>Place buy order</Button>
          <SheetClose render={<Button variant="outline">Cancel</Button>} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </div>
)
