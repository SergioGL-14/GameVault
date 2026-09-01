import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'

interface ModalProps {
  labelledBy: string
  className: string
  busy?: boolean
  children: ReactNode
  onClose: () => void
}

/** Renders modal content with native focus containment and restores focus when it closes. */
export default function Modal({
  labelledBy,
  className,
  busy = false,
  children,
  onClose
}: ModalProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = openerRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  function requestClose(): void {
    if (!busy) onClose()
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) requestClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog ${className}`}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClick={closeFromBackdrop}
    >
      {children}
    </dialog>
  )
}
