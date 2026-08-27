import { db } from './db'

/**
 * Sample a representative colour from an image (poster). Runs on a tiny
 * downscaled canvas, skips near-black/near-white/low-saturation pixels so we
 * get the "mood" colour, not the letterbox. Result cached in Dexie by URL.
 */
export async function posterAccent(url: string | null): Promise<string | null> {
  if (!url) return null
  const hit = await db.palettes.get(url)
  if (hit) return hit.hex

  try {
    const hex = await sample(url)
    if (hex) await db.palettes.put({ url, hex })
    return hex
  } catch {
    return null
  }
}

function sample(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onerror = () => resolve(null)
    img.onload = () => {
      const w = 24
      const h = Math.max(1, Math.round((img.height / img.width) * w)) || 24
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, w, h)
      let data: Uint8ClampedArray
      try {
        data = ctx.getImageData(0, 0, w, h).data
      } catch {
        return resolve(null) // tainted canvas
      }

      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let i = 0; i < data.length; i += 4) {
        const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        if (pa < 200) continue
        const max = Math.max(pr, pg, pb)
        const min = Math.min(pr, pg, pb)
        const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb
        if (lum < 24 || lum > 235) continue
        if (max - min < 18) continue // grey
        r += pr
        g += pg
        b += pb
        n++
      }
      if (!n) return resolve(null)
      const hex = toHex(clampVibrant(r / n, g / n, b / n))
      resolve(hex)
    }
    img.src = url
  })
}

/** Nudge toward a usable accent: keep hue, floor the lightness/saturation. */
function clampVibrant(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b)
  const scale = mx < 140 ? 150 / Math.max(mx, 1) : 1
  return [Math.min(255, r * scale), Math.min(255, g * scale), Math.min(255, b * scale)]
}

function toHex([r, g, b]: [number, number, number]): string {
  const p = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}
