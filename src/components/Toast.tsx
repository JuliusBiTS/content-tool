import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface ToastItem {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

interface ToastApi {
  show: (message: string, action?: ToastItem['action'], durationMs?: number) => void
  error: (message: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const show = useCallback<ToastApi['show']>(
    (message, action, durationMs = 4000) => {
      const id = ++seq.current
      setItems((xs) => [...xs.slice(-2), { id, message, action }])
      window.setTimeout(() => dismiss(id), durationMs)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (m) => show(m, undefined, 6000),
    }),
    [show],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-lg flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm shadow-lg"
          >
            <span className="min-w-0 flex-1 truncate">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
                className="shrink-0 font-semibold text-accent"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used within ToastProvider')
  return v
}
