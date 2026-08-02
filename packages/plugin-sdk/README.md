# @pairlens/plugin-sdk

The SDK and shared runtime for building Pairlens plugins.

A plugin is a single-file ESM module that exports:

- `manifest` — a `PluginManifest` (id, name, version, capabilities, `contributes`, …)
- `createPlugin(manifest)` — returns a `PluginInstance` (`execute`, optional
  `subscribe`, `initialize`, `destroy`, `executeCommand`, …)
- `getContributedComponents()` _(optional)_ — a record of `panelId → React component`
  (use `React.lazy`) for any panels declared in `manifest.contributes.panels`

## Shared runtime (what you may import)

Plugins are loaded at runtime and resolve a fixed set of **shared** dependencies
from the host via an import map — so there is exactly one React, one design
system, etc. Mark these **external** in your build (do not bundle them):

| Import specifier              | What it gives you                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `react`, `react/jsx-runtime`  | The host's React 19 instance                                                                          |
| `react-dom`                   | `createPortal`, `createRoot`, …                                                                       |
| `@tanstack/react-query`       | The host's Query client (`useQuery`, `useMutation`)                                                   |
| `@pairlens/plugin-sdk`        | Hooks: `usePanePair`, `useAuth`, `useNotify`, `useStream`, `useServiceRegistry`, `usePluginConfig`, … |
| `@pairlens/ui`                | Design system — import from the **root** only: `import { Button, Badge, Dialog } from '@pairlens/ui'` |
| `fast-financial-charts`       | Chart engine + theme tokens                                                                           |
| `fast-financial-charts/react` | `FastFinancialChart`, `DepthChart`, chart hooks                                                       |

Example build (single-file ESM, externals shared deps):

```bash
bun build src/index.ts --outfile dist/my-plugin.js --format esm \
  --external react --external 'react/jsx-runtime' \
  --external @pairlens/plugin-sdk --external @pairlens/ui \
  --external fast-financial-charts --external fast-financial-charts/react \
  --target browser --minify
```

### Notes & limits

- **`@pairlens/ui` is root-only.** Subpath imports like
  `@pairlens/ui/components/ui/button` are not in the import map and will fail at
  runtime — import the component from the package root instead.
- **Toasts:** use the SDK's `useNotify()`, not `sonner` directly (the host owns
  the single `<Toaster>`).
- **Single-file bundle.** The module is evaluated from a Blob URL that is revoked
  after import, so it cannot have dynamic sub-imports (`import('./chunk.js')`).
  Use `output.inlineDynamicImports` / a single `--outfile`.

## Styling contract

The host already compiles the design-system CSS and exposes its **theme tokens**
as CSS custom properties (`var(--background)`, `var(--foreground)`,
`var(--primary)`, `var(--border)`, …). Therefore:

- **Design-system components** (`@pairlens/ui`) render fully styled — their
  classes are part of the host's compiled CSS.
- **CSS variables** are always available — safe for inline styles / your own CSS.
- **Arbitrary Tailwind utility classes you author inside your plugin are NOT in
  the host's compiled CSS** (the host can't scan your source at its build time).
  For custom layout, use inline styles + the CSS variables above, or ship a
  `styles.css` with your plugin (referenced via `styleUrl` in the registry entry
  or bundled in your plugin package).

See `examples/dev-starter-plugin` for a minimal working plugin and
`examples/dev-sync-plugin` for cross-panel communication via the Service Registry.
