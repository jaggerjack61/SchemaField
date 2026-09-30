import { useCallback, useState } from 'react'
import { TriangleAlert, CircleHelp } from 'lucide-react'
import Modal from './Modal'

/**
 * Promise-based replacement for window.confirm.
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   if (!await confirm({ title, message, confirmLabel, tone: 'danger' })) return
 *   ...render {confirmDialog} somewhere in the component.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null)

  const confirm = useCallback(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    [],
  )

  function settle(result) {
    request.resolve(result)
    setRequest(null)
  }

  const danger = request?.tone === 'danger'
  const dialog = request && (
    <Modal
      size="sm"
      title={request.title}
      description={request.message}
      icon={danger ? <TriangleAlert /> : <CircleHelp />}
      tone={danger ? 'danger' : undefined}
      onClose={() => settle(false)}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
            {request.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => settle(true)}
          >
            {request.confirmLabel || 'Confirm'}
          </button>
        </>
      }
    />
  )

  return [confirm, dialog]
}
