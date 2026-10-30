import { useEffect, useRef } from 'react'

export default function SuccessDialog({ onClose, title = 'Creado exitosamente', message, actionLabel = 'Aceptar' }: { onClose: () => void; title?: string; message?: string; actionLabel?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="success-dialog" aria-labelledby="creation-success-title" aria-describedby={message ? 'creation-success-message' : undefined} onCancel={onClose}>
    <span className="success-dialog-icon" aria-hidden="true">✓</span>
    <h2 id="creation-success-title">{title}</h2>
    {message && <p id="creation-success-message" className="success-dialog-message">{message}</p>}
    <button type="button" className="primary" autoFocus onClick={onClose}>{actionLabel}</button>
  </dialog>
}
