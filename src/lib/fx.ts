/** Small sensory flourishes for the core "+1" action. Sound is opt-in. */

const SOUND_KEY = 'fx:sound'

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

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
