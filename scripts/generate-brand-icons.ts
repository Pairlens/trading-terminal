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
//   * apps/desktop/src-tauri/icons/ios/*               opaque, full bleed
//   * apps/desktop/src-tauri/icons/android/*           adaptive + legacy launcher
//
// macOS note: .icns is NOT full bleed. The system draws app icons at about
// 80% of the tile with the rest transparent, so the artwork carries its own
// rounded corners and its own margin. Shipping a full-bleed square there is
// the classic way to end up with an icon visibly larger than its neighbours
// in the Dock.
//
// The ios/ and android/ sets are here even though no configured Tauri bundle
// target reads them yet, because a mobile target added later would otherwise
// ship whatever brand was current the day `tauri icon` last ran.

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
const iosDir = join(iconsDir, 'ios')
const androidDir = join(iconsDir, 'android')

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

  // 8. iOS. Full bleed and OPAQUE: iOS masks the icon itself, and App Store
  //    review rejects an icon with an alpha channel outright. The set Tauri
  //    generated carried one on every file, so this is a fix as well as a
  //    brand swap. The `-1` files are the iPad entries at the same pixel
  //    size, which is why they are byte-identical to their twins.
  const IOS_ICONS: Array<[string, number]> = [
    ['AppIcon-20x20@1x.png', 20],
    ['AppIcon-20x20@2x.png', 40],
    ['AppIcon-20x20@2x-1.png', 40],
    ['AppIcon-20x20@3x.png', 60],
    ['AppIcon-29x29@1x.png', 29],
    ['AppIcon-29x29@2x.png', 58],
    ['AppIcon-29x29@2x-1.png', 58],
    ['AppIcon-29x29@3x.png', 87],
    ['AppIcon-40x40@1x.png', 40],
    ['AppIcon-40x40@2x.png', 80],
    ['AppIcon-40x40@2x-1.png', 80],
    ['AppIcon-40x40@3x.png', 120],
    ['AppIcon-60x60@2x.png', 120],
    ['AppIcon-60x60@3x.png', 180],
    ['AppIcon-76x76@1x.png', 76],
    ['AppIcon-76x76@2x.png', 152],
    ['AppIcon-83.5x83.5@2x.png', 167],
    ['AppIcon-512@2x.png', 1024],
  ]
  for (const [file, size] of IOS_ICONS) {
    const png = await sharp(await square(size))
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(join(iosDir, file), png)
  }
  written.push(`ios/ (${IOS_ICONS.length} files, opaque, 20..1024)`)

  // 9. Android. The adaptive foreground is a 108dp drawable of which only the
  //    centre 72dp survives the launcher's mask, so the mark is sized against
  //    what the user sees rather than against the drawable: MASKABLE_MARK of
  //    the visible 72dp, which is 45% of the 108dp canvas. Sizing it to the
  //    safe circle instead would technically fit (57% clears the diagonal
  //    bound) but puts the glyph hard against the mask edge, and reads a
  //    third heavier than the same icon does on the web. The background is a
  //    flat colour resource, so the foreground ships on transparency and the
  //    panel comes from values/ic_launcher_background.xml.
  const ADAPTIVE_SAFE = 72 / 108
  const ADAPTIVE_MARK = MASKABLE_MARK * ADAPTIVE_SAFE
  // Legacy pre-API-26 launcher icons at 48dp, and the round variant for
  //    launchers that asked for one. Tauri emitted 49px for hdpi, which is
  //    neither the 72px the bucket calls for nor anything else; corrected.
  const DENSITIES: Array<[string, number, number]> = [
    // dir, legacy edge (48dp), adaptive foreground edge (108dp)
    ['mipmap-mdpi', 48, 108],
    ['mipmap-hdpi', 72, 162],
    ['mipmap-xhdpi', 96, 216],
    ['mipmap-xxhdpi', 144, 324],
    ['mipmap-xxxhdpi', 192, 432],
  ]

  const circleMask = (size: number) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/>` +
        `</svg>`,
    )

  /** The mark centred on `edge`, at `frac` of the width, over `background`. */
  const markOn = async (
    edge: number,
    frac: number,
    background: string | { r: number; g: number; b: number; alpha: number },
  ) => {
    const markW = Math.round(edge * frac)
    const mark = await sharp(markSource)
      .resize({ width: markW, kernel: 'lanczos3' })
      .png()
      .toBuffer()
    const meta = await sharp(mark).metadata()
    return sharp({
      create: { width: edge, height: edge, channels: 4, background },
    })
      .composite([
        {
          input: mark,
          left: Math.round((edge - markW) / 2),
          top: Math.round((edge - (meta.height ?? 0)) / 2),
        },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
  for (const [dir, legacy, adaptive] of DENSITIES) {
    const target = join(androidDir, dir)
    mkdirSync(target, { recursive: true })

    // Foreground layer: mark only, on transparency.
    writeFileSync(
      join(target, 'ic_launcher_foreground.png'),
      await markOn(adaptive, ADAPTIVE_MARK, TRANSPARENT),
    )

    // Legacy square, squircle-cut the same way every other platform is.
    writeFileSync(join(target, 'ic_launcher.png'), await rounded(legacy))

    // Legacy round. The panel is a full circle, and the mark keeps the PWA
    // maskable's 68% so the two read at the same weight side by side.
    const round = await sharp(await markOn(legacy, MASKABLE_MARK, PANEL))
      .composite([{ input: circleMask(legacy), blend: 'dest-in' }])
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(join(target, 'ic_launcher_round.png'), round)
  }
  written.push(
    `android/ (${DENSITIES.length} densities x 3, adaptive mark at ` +
      `${Math.round(ADAPTIVE_MARK * 100)}% of canvas = ` +
      `${Math.round(MASKABLE_MARK * 100)}% of the visible area)`,
  )

  // The adaptive background is a colour resource, not a bitmap. Tauri seeds
  // it white, which puts the one white icon in a brand that is black
  // everywhere else.
  writeFileSync(
    join(androidDir, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<resources>\n' +
      `  <color name="ic_launcher_background">${PANEL}</color>\n` +
      '</resources>\n',
  )
  written.push(`android/values/ic_launcher_background.xml (${PANEL})`)

  console.log(`Wrote ${written.length} files:`)
  for (const line of written) console.log(`  ${line}`)
  console.log(
    '\nUntouched by design: the Windows/Linux set and the installer bitmaps.' +
      '\ngenerate-desktop-icons.ts owns those.',
  )
}

await main()
