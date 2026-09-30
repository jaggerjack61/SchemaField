import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open modals, innermost last, so Escape and Tab only act on the top one.
const openModals = []

/**
 * Accessible dialog rendered into document.body.
 * Pass `onSubmit` to wrap the body and footer in a <form>, so the footer's
 * submit button and Enter in a field both submit it.
 */
export default function Modal({
  title,
  description,
  icon,
  tone,
  size,
  onClose,
  onSubmit,
  footer,
  children,
  className = '',
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement
    openModals.push(dialog)

    // Children with autoFocus have already focused themselves.
    if (!dialog.contains(document.activeElement)) dialog.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (openModals[openModals.length - 1] !== dialog) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      openModals.splice(openModals.indexOf(dialog), 1)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [])

  const content = (
    <>
      {children != null && <div className="modal-body">{children}</div>}
      {footer && <div className="modal-footer">{footer}</div>}
    </>
  )

  return createPortal(
    <div
      className="modal-overlay"
      // Only a press that starts on the backdrop itself closes the dialog,
      // so text selections that end outside it don't dismiss it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        className={`modal ${size ? `modal-${size}` : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header">
          {icon && <div className={`modal-icon ${tone ? `tone-${tone}` : ''}`}>{icon}</div>}
          <div className="modal-header-text">
            <h2 className="modal-title" id={titleId}>{title}</h2>
            {description && <p className="modal-description" id={descriptionId}>{description}</p>}
          </div>
          {onClose && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
              <X />
            </button>
          )}
        </div>
        {onSubmit ? <form onSubmit={onSubmit}>{content}</form> : content}
      </div>
    </div>,
    document.body,
  )
}
