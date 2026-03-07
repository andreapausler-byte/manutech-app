/**
 * Generate PWA icons for ManuTech
 * Run: node scripts/generate-icons.js
 */
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const SIZES = [72, 96, 128, 192, 512]

// ManuTech icon: wrench on green gradient
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B6B4A"/>
      <stop offset="100%" stop-color="#0D4A30"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g transform="translate(256,256) scale(0.5)" fill="none" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">
    <path d="M170,-170 L-100,100 L-170,170"/>
    <path d="M-170,170 C-210,210 -170,280 -110,220 L100,-100"/>
    <path d="M80,-80 L170,-170 C210,-210 280,-170 220,-110 L130,-20"/>
    <circle cx="-140" cy="140" r="50" fill="white" opacity="0.15"/>
  </g>
  <text x="256" y="430" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="72" font-weight="800" letter-spacing="-2">MT</text>
</svg>
`

async function generate() {
  for (const size of SIZES) {
    const buf = Buffer.from(svg)
    await sharp(buf)
      .resize(size, size)
      .png()
      .toFile(join(outDir, `icon-${size}x${size}.png`))
    console.log(`✓ icon-${size}x${size}.png`)
  }

  // Also generate maskable (with padding)
  const maskableSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#0D4A30"/>
    <g transform="translate(256,226) scale(0.4)" fill="none" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">
      <path d="M170,-170 L-100,100 L-170,170"/>
      <path d="M-170,170 C-210,210 -170,280 -110,220 L100,-100"/>
      <path d="M80,-80 L170,-170 C210,-210 280,-170 220,-110 L130,-20"/>
      <circle cx="-140" cy="140" r="50" fill="white" opacity="0.15"/>
    </g>
    <text x="256" y="400" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="64" font-weight="800" letter-spacing="-2">MT</text>
  </svg>
  `
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(join(outDir, 'maskable-512x512.png'))
  console.log('✓ maskable-512x512.png')

  console.log('\nAll icons generated!')
}

generate().catch(console.error)
