import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** full-height sheet (for search) vs. content-height */
  tall?: boolean
}

export function Sheet({ open, onClose, title, children, tall }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative w-full rounded-t-2xl border-t border-border bg-surface',
          'mx-auto max-w-lg animate-[slideup_0.22s_ease-out]',
          tall ? 'h-[92vh]' : 'max-h-[85vh]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        </div>
        {title && (
          <h2 className="px-5 pb-2 text-lg font-semibold">{title}</h2>
        )}
        <div className={clsx('overflow-y-auto px-5 pb-6', tall ? 'h-[calc(92vh-4rem)]' : '')}>
          {children}
        </div>
      </div>
      <style>{`@keyframes slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  )
}
