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
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-6">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative w-full border-border bg-surface',
          'mx-auto max-w-lg border-t rounded-t-2xl animate-[slideup_0.22s_ease-out]',
          'sm:rounded-2xl sm:border sm:animate-[fadein_0.15s_ease-out] sm:shadow-2xl',
          tall ? 'h-[92dvh] sm:h-[80vh]' : 'max-h-[85dvh] sm:max-h-[80vh]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:hidden">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
        </div>
        {title && (
          <h2 className="px-5 pb-2 pt-2 text-lg font-semibold sm:pt-4">{title}</h2>
        )}
        <div
          className={clsx(
            'overflow-y-auto px-5 pb-6',
            tall ? 'h-[calc(92dvh-4rem)] sm:h-[calc(80vh-4rem)]' : '',
          )}
        >
          {children}
        </div>
      </div>
      <style>{`
        @keyframes slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadein{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}
      `}</style>
    </div>
  )
}
