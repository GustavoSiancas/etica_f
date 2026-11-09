import { useEffect } from 'react'
import type { ReactNode } from 'react'

export default function Modal({
  eyebrow,
  title,
  description,
  busy,
  onClose,
  children,
  size = 'md',
}: {
  eyebrow?: string
  title: string
  description?: string
  busy?: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div
      className="person-dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className={`person-dialog tree-dialog tree-dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-dialog-title"
      >
        <div className="person-dialog-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="tree-dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="dialog-close"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar diálogo"
            title="Cerrar"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
