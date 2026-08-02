# Pairlens UI — conventions for building with this design system

`@pairlens/ui` is a **React 19 + Tailwind v4** component library (shadcn "base-nova" style, built on
base-ui primitives) for an AI-native crypto spot-trading terminal. Import every component and sub-part
from the package root: `import { Button, Card, CardHeader, Dialog, DialogContent } from '@pairlens/ui'`
(65 primary components; ~310 named exports incl. all compound sub-parts). Components ship fully styled.

## Setup

- **Theme**: light by default. For dark mode, put `class="dark"` on an ancestor (e.g. `<html>` / a root
  `<div className="dark">`) — every token flips. No provider is required for theming.
- **Toasts**: mount one `<Toaster />` once near the app root, then call `toast(...)` (also exported from
  `@pairlens/ui`): `toast.success('Order filled', { description: '0.25 BTC on OKX' })`.
- **Sidebar layouts**: wrap in `<SidebarProvider>` … `<Sidebar>` + `<SidebarInset>` … `</SidebarProvider>`.
- **Overlays** (Dialog, Sheet, Drawer, Popover, DropdownMenu, Select, Tooltip, …) are controlled/uncontrolled
  via `open`/`defaultOpen`; compose them from their sub-parts (e.g. `Dialog` → `DialogContent` →
  `DialogHeader`/`DialogTitle`/`DialogFooter`). base-ui composition uses a `render` prop:
  `<DialogClose render={<Button variant="outline">Cancel</Button>} />`.

## Styling idiom — Tailwind utilities + semantic tokens

Style components through `className` with Tailwind v4 utilities bound to the DS's **semantic color tokens**
(these adapt to light/dark automatically — never hard-code hex):

| Purpose        | Utilities (verified in the shipped CSS)                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces       | `bg-background` `text-foreground`, `bg-card` `text-card-foreground`, `bg-muted` `text-muted-foreground`                                             |
| Accent/actions | `bg-primary` `text-primary-foreground`, `bg-secondary` `text-secondary-foreground`, `bg-destructive`                                                |
| Lines/focus    | `border` `border-border`, `ring-ring`                                                                                                               |
| Radius / type  | `rounded-lg`=`--radius` (`rounded-md`/`rounded-sm`/`rounded-xl`), `text-sm`, `font-medium`, `font-sans`/`font-mono` (serif via `var(--font-serif)`) |
| Charts / P&L   | series colors `--chart-1`…`--chart-5` — up/profit = `var(--chart-2)` (green), down/loss = `var(--destructive)` (red)                                |
| Sidebar        | `bg-sidebar` `text-sidebar-foreground`, `border-sidebar-border`                                                                                     |

The shipped stylesheet contains the utility set the components use (broad: all `flex`/`grid`/`gap-*`/
`p-*`/`text-*`/`rounded-*`/semantic-color utilities). For a color the utilities don't cover, use the CSS
variable directly — **all tokens are defined on `:root` and `.dark`**: `style={{ color: 'var(--primary)',
background: 'var(--card)', borderColor: 'var(--border)' }}` (also `--muted-foreground`, `--accent`,
`--ring`, `--sidebar`, `--chart-1..5`, `--radius`, `--font-sans/serif/mono`). Fonts: Mozilla Text (sans),
Playfair Display (serif), JetBrains Mono (mono).

## Where the truth lives

Read the DS stylesheet (`styles.css` and its `@import` of `_ds_bundle.css`) for the exact tokens/utilities,
and each component's `<Name>.d.ts` (its props contract) + `<Name>.prompt.md` (usage) before styling it.

## Idiomatic example

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from '@pairlens/ui'

export function PositionCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>BTC / USDT</CardTitle>
        <CardDescription>Open long · 0.42 BTC</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Unrealized P&L</span>
        <Badge variant="secondary">+12.4%</Badge>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" variant="outline">
          Adjust
        </Button>
        <Button size="sm" variant="destructive">
          Close
        </Button>
      </CardFooter>
    </Card>
  )
}
```
