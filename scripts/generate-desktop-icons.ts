// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//
// Regenerates the Windows + Linux desktop icon set and the Windows installer
// branding bitmaps from the brand artwork. Run with:
//
//   bun scripts/generate-desktop-icons.ts
//
// Everything it writes is a committed build artifact under
// apps/desktop/src-tauri/icons/ — re-running is idempotent (same inputs
// produce byte-identical outputs), so it is safe to run after a brand tweak
// and commit the diff.
//
// Why this exists: `tauri icon` produces hard-edged square PNGs/ICOs, which
// look wrong on Windows 11 and on Linux shells that draw icons unmasked.
// macOS is unaffected because the OS masks .icns itself — icon.icns is
// deliberately NOT regenerated here, and neither are the icons/ios and
// icons/android folders.
//
// What it produces:
//   * squircle-masked PNGs (Windows/Linux sizes + the Square*Logo tiles)
//   * a multi-size icon.ico (PNG-compressed entries, 16..256)
//   * WiX MSI banner (493x58) + dialog (493x312) BMPs
//   * NSIS header (150x57) + sidebar (164x314) BMPs
//
// The installer bitmaps follow the WixUI_InstallDir / NSIS MUI2 conventions:
// installer text is painted in black directly on top of these images, so the
// regions the text occupies stay light and only the art regions go dark.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(repoRoot, 'apps/desktop/src-tauri/icons')

// sharp lives in apps/marketing (it is also used by the screenshot/OG
// pipeline there). Resolve it from that workspace so the root package.json
// does not need a duplicate dependency.
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

// ---------------------------------------------------------------------------
// Squircle
// ---------------------------------------------------------------------------

// Rounded rectangle whose corners follow a superellipse quarter-arc instead of
// a circular one — straight edges (Windows 11 house style) with the continuous
// curvature that makes the corner read as a squircle rather than a filleted
// box. RADIUS_RATIO is the corner radius as a fraction of the edge; EXPONENT
// is the superellipse `n` (2 would be a plain circular arc, higher pushes the
// curve out towards the square corner).
const RADIUS_RATIO = 0.225
const EXPONENT = 4.5
const ARC_STEPS = 96

function squirclePath(size: number): string {
  const r = size * RADIUS_RATIO
  // Top-left corner arc, from the left edge (0, r) round to the top edge (r, 0).
  const corner: Array<[number, number]> = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = (i / ARC_STEPS) * (Math.PI / 2)
    const x = r - r * Math.cos(t) ** (2 / EXPONENT)
    const y = r - r * Math.sin(t) ** (2 / EXPONENT)
    corner.push([x, y])
  }

  const n = (v: number) => Number(v.toFixed(3))
  const pts: Array<[number, number]> = []
  // Clockwise: TL arc, top edge, TR arc, right edge, BR arc, bottom, BL arc.
  for (const [x, y] of corner) pts.push([x, y])
  for (const [x, y] of [...corner].reverse()) pts.push([size - x, y])
  for (const [x, y] of corner) pts.push([size - x, size - y])
  for (const [x, y] of [...corner].reverse()) pts.push([x, size - y])

  const [first, ...rest] = pts
  return (
    `M ${n(first[0])} ${n(first[1])} ` +
    rest.map(([x, y]) => `L ${n(x)} ${n(y)}`).join(' ') +
    ' Z'
  )
}

function squircleMask(size: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<path d="${squirclePath(size)}" fill="#ffffff"/>` +
      `</svg>`,
  )
}

// ---------------------------------------------------------------------------
// ICO container (sharp cannot write .ico)
// ---------------------------------------------------------------------------

// Vista+ reads PNG-compressed ICO entries at every size, which is what the
// previous icon.ico already used — keeps alpha (and therefore the squircle
// corners) intact without hand-rolling DIB + AND masks.
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
// BMP container (WiX and NSIS only accept bitmaps)
// ---------------------------------------------------------------------------

// 24-bit BI_RGB, bottom-up — the most broadly understood BMP flavour, and the
// one both the Windows Installer UI and NSIS MUI2 expect (neither honours an
// alpha channel, so callers flatten first).
function encodeBmp(rgb: Buffer, width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowSize * height
  const out = Buffer.alloc(54 + pixelBytes)

  out.write('BM', 0, 'ascii')
  out.writeUInt32LE(54 + pixelBytes, 2) // file size
  out.writeUInt32LE(54, 10) // pixel data offset
  out.writeUInt32LE(40, 14) // BITMAPINFOHEADER size
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22) // positive => bottom-up
  out.writeUInt16LE(1, 26) // planes
  out.writeUInt16LE(24, 28) // bpp
  out.writeUInt32LE(0, 30) // BI_RGB
  out.writeUInt32LE(pixelBytes, 34)
  out.writeInt32LE(2835, 38) // 72 dpi
  out.writeInt32LE(2835, 42)

  for (let y = 0; y < height; y++) {
    const src = y * width * 3
    const dst = 54 + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      out[dst + x * 3] = rgb[src + x * 3 + 2] // B
      out[dst + x * 3 + 1] = rgb[src + x * 3 + 1] // G
      out[dst + x * 3 + 2] = rgb[src + x * 3] // R
    }
  }
  return out
}

type SharpImage = { raw: () => any; toBuffer: (o: any) => Promise<any> }

async function writeBmp(image: SharpImage, file: string) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  writeFileSync(join(iconsDir, file), encodeBmp(data, info.width, info.height))
  return `${file} (${info.width}x${info.height} BMP24)`
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// Brand surfaces. The panel gradient is the icon's near-black background with
// a touch of the warm-graphite tint used by the app shell.
const PANEL_TOP = '#171310'
const PANEL_BOTTOM = '#000000'
const PAPER = '#ffffff'
const PAPER_EDGE = '#f4f1ee'

const MASTER = 1024

// Windows/Linux PNG sizes that Tauri (and the MSIX tile set) consume.
// icon.icns is intentionally absent — macOS masks it itself.
const PNG_OUTPUTS: Array<[string, number]> = [
  ['32x32.png', 32],
  ['64x64.png', 64],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
  ['Square30x30Logo.png', 30],
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square89x89Logo.png', 89],
  ['Square107x107Logo.png', 107],
  ['Square142x142Logo.png', 142],
  ['Square150x150Logo.png', 150],
  ['Square284x284Logo.png', 284],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
]

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function panelSvg(width: number, height: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${PANEL_TOP}"/>` +
      `<stop offset="1" stop-color="${PANEL_BOTTOM}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
      `</svg>`,
  )
}

async function main() {
  const written: Array<string> = []

  // 1. Master squircle at 1024, then downscale — masking once at full
  //    resolution and resampling keeps the corners cleanly antialiased even at
  //    16px, which masking per-size does not.
  const master = await sharp(join(iconsDir, 'AppIcon.png'))
    .resize(MASTER, MASTER, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: squircleMask(MASTER), blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  const scaled = (size: number) =>
    sharp(master)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer()

  for (const [file, size] of PNG_OUTPUTS) {
    writeFileSync(join(iconsDir, file), await scaled(size))
    written.push(`${file} (${size}x${size})`)
  }

  // 2. icon.ico — the exe icon, the taskbar icon, and (via ARPPRODUCTICON in
  //    Tauri's main.wxs) the Add/Remove Programs entry for the MSI.
  const ico = buildIco(
    await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, png: await scaled(size) })),
    ),
  )
  writeFileSync(join(iconsDir, 'icon.ico'), ico)
  written.push(`icon.ico (${ICO_SIZES.join(', ')})`)

  // 3. Installer branding.
  const wideLogo = join(repoRoot, 'apps/terminal/public/logo.svg')
  const markPng = await scaled(256)

  // WiX banner, 493x58. WixUI paints the dialog title in black at roughly
  // x=20..286, so the left two-thirds stay paper-white and the mark sits at
  // the right edge.
  const bannerMark = await sharp(markPng).resize(44, 44).toBuffer()
  const banner = sharp({
    create: {
      width: 493,
      height: 58,
      channels: 3,
      background: PAPER,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58">` +
            `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0.55" stop-color="${PAPER}"/>` +
            `<stop offset="1" stop-color="${PAPER_EDGE}"/>` +
            `</linearGradient></defs>` +
            `<rect width="493" height="58" fill="url(#g)"/>` +
            `</svg>`,
        ),
        top: 0,
        left: 0,
      },
      { input: bannerMark, top: 7, left: 493 - 44 - 16 },
    ])
    .removeAlpha()
  written.push(await writeBmp(banner, 'installer-banner.bmp'))

  // WiX dialog, 493x312. WixUI puts the welcome/exit text at x>=180, so the
  // dark art panel stops at the conventional 164px.
  const dialogArt = await sharp(wideLogo, { density: 400 })
    .resize({ width: 136, fit: 'inside' })
    .toBuffer()
  const dialogArtMeta = await sharp(dialogArt).metadata()
  const dialog = sharp({
    create: { width: 493, height: 312, channels: 3, background: PAPER },
  })
    .composite([
      { input: panelSvg(164, 312), top: 0, left: 0 },
      {
        input: dialogArt,
        top: Math.round((312 - (dialogArtMeta.height ?? 0)) / 2),
        left: 14,
      },
    ])
    .removeAlpha()
  written.push(await writeBmp(dialog, 'installer-dialog.bmp'))

  // NSIS MUI2 header, 150x57. The MUI header background is white with black
  // text, and the image can sit on either side depending on the theme, so the
  // mark is centred on paper.
  const headerMark = await sharp(markPng).resize(41, 41).toBuffer()
  const header = sharp({
    create: { width: 150, height: 57, channels: 3, background: PAPER },
  })
    .composite([{ input: headerMark, top: 8, left: 55 }])
    .removeAlpha()
  written.push(await writeBmp(header, 'installer-header.bmp'))

  // NSIS MUI2 welcome/finish sidebar, 164x314 — page text is drawn to the
  // right of it, so this one can go fully dark.
  const sidebarArt = await sharp(wideLogo, { density: 400 })
    .resize({ width: 136, fit: 'inside' })
    .toBuffer()
  const sidebarArtMeta = await sharp(sidebarArt).metadata()
  const sidebar = sharp({
    create: { width: 164, height: 314, channels: 3, background: PANEL_BOTTOM },
  })
    .composite([
      { input: panelSvg(164, 314), top: 0, left: 0 },
      {
        input: sidebarArt,
        top: Math.round((314 - (sidebarArtMeta.height ?? 0)) / 2),
        left: 14,
      },
    ])
    .removeAlpha()
  written.push(await writeBmp(sidebar, 'installer-sidebar.bmp'))

  console.log(`Wrote ${written.length} files to ${iconsDir}:`)
  for (const line of written) console.log(`  ${line}`)
  console.log(
    '\nUntouched by design: icon.icns (macOS masks it), AppIcon.png (source), ios/, android/',
  )
}

await main()
