// Regenerate PWA icons + favicon from an inline SVG.
// Run:  node scripts/gen-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const BG = '#0b0b0f'
const ACCENT = '#7c5cff'

const glyph = (size, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="${BG}"/>
  <rect x="86" y="86" width="340" height="340" rx="72" fill="${ACCENT}"/>
  <path d="M223 196c0-9 10-15 18-10l84 50c8 5 8 16 0 21l-84 50c-8 5-18-1-18-10z" fill="#fff"/>
</svg>`

const favicon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${ACCENT}"/>
  <path d="M198 176c0-11 12-18 21-12l112 66c9 6 9 19 0 24l-112 66c-9 6-21-1-21-12z" fill="#fff"/>
</svg>`

const out = 'public'
await mkdir(out, { recursive: true })

const targets = [
  { name: 'pwa-192.png', size: 192, pad: false },
  { name: 'pwa-512.png', size: 512, pad: false },
  { name: 'pwa-maskable-512.png', size: 512, pad: true },
  { name: 'apple-touch-icon.png', size: 180, pad: false },
]

for (const t of targets) {
  const buf = await sharp(Buffer.from(glyph(t.size, t.pad))).png().toBuffer()
  await writeFile(`${out}/${t.name}`, buf)
  console.log('wrote', t.name)
}

await writeFile(`${out}/favicon.svg`, favicon.trim())
console.log('wrote favicon.svg')
