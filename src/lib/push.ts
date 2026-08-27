import { supabase } from './supabase'
import { VAPID_PUBLIC_KEY } from './vapid'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function ready(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function pushStatus(): Promise<'unsupported' | 'off' | 'on' | 'denied'> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await ready()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(): Promise<'on' | 'denied' | 'error'> {
  const reg = await ready()
  if (!reg) return 'error'

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'

  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        ua: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    return 'on'
  } catch (e) {
    console.warn('[push] enable failed', e)
    return 'error'
  }
}

export async function disablePush(): Promise<void> {
  const reg = await ready()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
