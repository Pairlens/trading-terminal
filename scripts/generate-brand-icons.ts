// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//
// Regenerates every app icon that generate-desktop-icons.ts deliberately
// leaves alone: the macOS .icns, the terminal's PWA and Apple touch icons,
// and the two favicons. It also cuts the marketing site's navbar mark, which
// is the same artwork without the icon panel. Run with:
//
//   bun scripts/generate-brand-icons.ts
//
// Sibling to generate-desktop-icons.ts on purpose. That script owns the
// Windows/Linux set and the installer bitmaps and is wired into Tauri's
// bundle.icon list; this one owns the surfaces Tauri never sees. Both read
// the SAME master, apps/desktop/src-tauri/icons/AppIcon.png (1024x1024, the
// mark on its near-black panel, full bleed), and both cut corners with the
// shared squircle, so a Windows tile and a PWA icon can never drift apart.
//
// Everything it writes is a committed build artifact: re-running is
// idempotent, so it is safe to run after a brand tweak and commit the diff.
//
// What it produces:
//   * apps/desktop/src-tauri/icons/icon.icns (macOS, squircle inset in a
//     transparent canvas the way macOS app icons are drawn)
//   * apps/terminal/public/{logo192,logo512}.png       squircle, transparent corners
//   * apps/terminal/public/icon-maskable-{192,512}.png full bleed, safe zone
//   * apps/terminal/public/apple-touch-icon.png        full bleed, opaque
//   * apps/terminal/public/favicon.ico                 16..256
//   * apps/marketing/public/favicon.ico                the root-probe fallback
//   * apps/marketing/src/assets/icon.png               imported, so its URL is hashed
//   * apps/marketing/src/assets/mark.webp              navbar mark, no panel
//
// macOS note: .icns is NOT full bleed. The system draws app icons at about
// 80% of the tile with the rest transparent, so the artwork carries its own
// rounded corners and its own margin. Shipping a full-bleed square there is
// the classic way to end up with an icon visibly larger than its neighbours
// in the Dock.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { squircleMask } from './lib/squircle.ts'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(repoRoot, 'apps/desktop/src-tauri/icons')
const terminalPublic = join(repoRoot, 'apps/terminal/public')
const marketingPublic = join(repoRoot, 'apps/marketing/public')
const marketingAssets = join(repoRoot, 'apps/marketing/src/assets')

// sharp lives in apps/marketing; resolve it from that workspace so the root
// package.json does not need a duplicate dependency.
function loadSharp() {
  for (const base of ['package.json', 'apps/marketing/package.json']) {
    try {
      return createRequire(join(repoRoot, base))('sharp')
    } catch {
      /* try next workspace */
    }
  }
  throw new Error(
    'sharp not found. Run `bun install` (it is a devDependency of apps/marketing).',
  )
}

const sharp = loadSharp()

const MASTER_SIZE = 1024
const masterPath = join(iconsDir, 'AppIcon.png')
// The same mark with no panel behind it, for surfaces that draw their own
// ground: the maskable icons compose it themselves, and the marketing navbar
// sets it straight on the marble pill.
const markSource = join(repoRoot, 'docs/assets/mark-master.webp')

// The panel colour the master is built on. Used to flatten anything that has
// to ship opaque, so a transparent corner never gets composited onto white.
const PANEL = '#000000'

// ---------------------------------------------------------------------------
// ICO container (sharp cannot write .ico)
// ---------------------------------------------------------------------------

// Vista+ reads PNG-compressed ICO entries at every size, which keeps alpha
// (and therefore the squircle corners) intact without hand-rolling DIB + AND
// masks. Same encoder as generate-desktop-icons.ts; kept local because that
// one writes the Tauri exe icon and this one writes the two favicons, and a
// shared copy would put an ICO writer in a module neither of them owns.
function buildIco(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries: Array<Buffer> = []
  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2) // palette size
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(e)
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function main() {
  const written: Array<string> = []

  // Masking once at full resolution and resampling down keeps the corners
  // cleanly antialiased even at 16px, which masking per-size does not.
  const masked = await sharp(masterPath)
    .resize(MASTER_SIZE, MASTER_SIZE, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: squircleMask(MASTER_SIZE), blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  /** Squircle-cut, transparent outside the corners. */
  const rounded = (size: number) =>
    sharp(masked)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer()

  /** Full bleed and opaque: no transparent corner to be composited on white. */
  const square = (size: number) =>
    sharp(masterPath)
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .flatten({ background: PANEL })
      .png({ compressionLevel: 9 })
      .toBuffer()

  const write = (dir: string, file: string, buf: Buffer, note: string) => {
    writeFileSync(join(dir, file), buf)
    written.push(`${file} (${note})`)
  }

  // 1. macOS. The artwork occupies MACOS_CONTENT of the tile and the rest is
  //    transparent margin, which is how the system expects an app icon to be
  //    drawn and what the icon this replaces already did (0.809 measured).
  const MACOS_CONTENT = 0.809
  const MACOS_SIZES = [16, 32, 128, 256, 512] as const
  // iconutil refuses any directory not named *.iconset, so the temp dir holds
  // a correctly named one rather than being one.
  const iconsetParent = mkdtempSync(join(tmpdir(), 'pairlens-icns-'))
  const iconset = join(iconsetParent, 'icon.iconset')
  mkdirSync(iconset)
  try {
    for (const size of MACOS_SIZES) {
      for (const scale of [1, 2]) {
        const edge = size * scale
        const content = Math.round(edge * MACOS_CONTENT)
        const art = await sharp(masked)
          .resize(content, content, { kernel: 'lanczos3' })
          .png()
          .toBuffer()
        const tile = await sharp({
          create: {
            width: edge,
            height: edge,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([
            {
              input: art,
              left: Math.round((edge - content) / 2),
              top: Math.round((edge - content) / 2),
            },
          ])
          .png({ compressionLevel: 9 })
          .toBuffer()
        const name =
          scale === 1
            ? `icon_${size}x${size}.png`
            : `icon_${size}x${size}@2x.png`
        writeFileSync(join(iconset, name), tile)
      }
    }
    // iconutil is macOS-only. It is the only writer that produces an .icns
    // Finder and the Dock read at every scale without complaint.
    execFileSync('iconutil', [
      '-c',
      'icns',
      iconset,
      '-o',
      join(iconsDir, 'icon.icns'),
    ])
    written.push(`icon.icns (${MACOS_SIZES.join(', ')} at 1x and 2x)`)
  } finally {
    rmSync(iconsetParent, { recursive: true, force: true })
  }

  // 2. PWA "any" icons. Transparent corners: the OS draws these on its own
  //    ground and a hard square would read as an unstyled tile.
  write(terminalPublic, 'logo192.png', await rounded(192), '192x192 squircle')
  write(terminalPublic, 'logo512.png', await rounded(512), '512x512 squircle')

  // 3. PWA maskable icons. Android crops these to whatever shape the launcher
  //    uses, so everything that must survive sits inside a centred circle of
  //    80% diameter. The mark is 1.66:1, so the diagonal is what binds:
  //    w * sqrt(1 + 1/1.66^2) <= 0.8 * edge puts the ceiling at 68% width.
  const MASKABLE_MARK = 0.68
  for (const edge of [192, 512]) {
    const markW = Math.round(edge * MASKABLE_MARK)
    const mark = await sharp(markSource)
      .resize({ width: markW, kernel: 'lanczos3' })
      .png()
      .toBuffer()
    const markMeta = await sharp(mark).metadata()
    const tile = await sharp({
      create: { width: edge, height: edge, channels: 4, background: PANEL },
    })
      .composite([
        {
          input: mark,
          left: Math.round((edge - markW) / 2),
          top: Math.round((edge - (markMeta.height ?? 0)) / 2),
        },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer()
    write(
      terminalPublic,
      `icon-maskable-${edge}.png`,
      tile,
      `${edge}x${edge} full bleed, mark at ${Math.round(MASKABLE_MARK * 100)}%`,
    )
  }

  // 4. Apple touch icon. Full bleed square on purpose: iOS applies its own
  //    corner mask, and a PNG with transparent corners is composited onto
  //    white first, which would ring the icon in a white sliver.
  write(
    terminalPublic,
    'apple-touch-icon.png',
    await square(180),
    '180x180 full bleed',
  )

  // 5. Favicons. 16 and 32 are what a tab actually shows; the rest are for
  //    bookmark bars, Windows shortcuts and the taskbar.
  const FAVICON_SIZES = [16, 24, 32, 48, 64, 128, 256]
  const favicon = buildIco(
    await Promise.all(
      FAVICON_SIZES.map(async (size) => ({ size, png: await rounded(size) })),
    ),
  )
  write(terminalPublic, 'favicon.ico', favicon, FAVICON_SIZES.join(', '))
  write(marketingPublic, 'favicon.ico', favicon, FAVICON_SIZES.join(', '))

  // 6. The marketing site's linked icon. It lives in src/assets rather than
  //    public/ so Astro emits it at a content-hashed URL: public/ icons are
  //    cached for a day by vercel.json, which is exactly how a brand swap
  //    ends up serving the old mark to everyone who visited yesterday.
  mkdirSync(marketingAssets, { recursive: true })
  write(marketingAssets, 'icon.png', await rounded(512), '512x512 squircle')

  // 7. The marketing navbar mark. No panel: it sits on the marble pill and
  //    carries its own outline, so it reads there and on the graphite footer
  //    alike. 512 wide covers a 28px-tall render past 3x. src/assets for the
  //    same content-hash reason as the icon above.
  const navMark = await sharp(markSource)
    .resize({ width: 512, kernel: 'lanczos3' })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer()
  const navMarkMeta = await sharp(navMark).metadata()
  write(
    marketingAssets,
    'mark.webp',
    navMark,
    `${navMarkMeta.width}x${navMarkMeta.height} transparent`,
  )

  console.log(`Wrote ${written.length} files:`)
  for (const line of written) console.log(`  ${line}`)
  console.log(
    '\nUntouched by design: the Windows/Linux set and the installer bitmaps' +
      '\n(generate-desktop-icons.ts owns those), and icons/ios + icons/android,' +
      '\nwhich no configured Tauri bundle target reads.',
  )
}

await main()
