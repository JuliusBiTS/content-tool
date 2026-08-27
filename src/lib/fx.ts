/** Small sensory flourishes for the core "+1" action. Sound is opt-in. */

const SOUND_KEY = 'fx:sound'
const SPOILER_KEY = 'fx:spoilers'

function flag(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v == null ? dflt : v === '1'
  } catch {
    return dflt
  }
}
function setFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export const soundEnabled = () => flag(SOUND_KEY, false)
export const setSoundEnabled = (on: boolean) => setFlag(SOUND_KEY, on)

/** Hide names / stills of unwatched episodes until revealed. Default on. */
export const spoilerGuard = () => flag(SPOILER_KEY, true)
export const setSpoilerGuard = (on: boolean) => setFlag(SPOILER_KEY, on)

export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}

let ctx: AudioContext | null = null

/** A short, soft "ticket punch" — synthesised, no asset. */
export function punchSound(): void {
  if (!soundEnabled()) return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new AC()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.09)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.18)
  } catch {
    /* ignore */
  }
}

export function bumpFx(): void {
  haptic()
  punchSound()
}

/** A short confetti burst for finishing a series / book. No dependency. */
export function celebrate(accent = '#7c5cff'): void {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  haptic(30)

  const c = document.createElement('canvas')
  c.style.cssText =
    'position:fixed;inset:0;z-index:9999;pointer-events:none'
  c.width = innerWidth
  c.height = innerHeight
  document.body.appendChild(c)
  const ctx = c.getContext('2d')!
  const colors = [accent, '#ffffff', '#35c88a', '#ffd166']
  const N = 120
  const parts = Array.from({ length: N }, () => ({
    x: innerWidth / 2,
    y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -14 - 4,
    g: 0.3 + Math.random() * 0.2,
    s: 3 + Math.random() * 5,
    col: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.4,
  }))

  const start = performance.now()
  function frame(t: number) {
    const dt = Math.min(2, (t - start) / 16 / 60 + 1)
    ctx.clearRect(0, 0, c.width, c.height)
    for (const p of parts) {
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.col
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6)
      ctx.restore()
    }
    if (t - start < 2200) requestAnimationFrame(frame)
    else c.remove()
  }
  requestAnimationFrame(frame)
}
