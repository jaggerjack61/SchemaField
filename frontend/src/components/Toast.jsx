import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'

export function useToast(duration = 3000) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(timerRef.current)
    setToast({ message, type, id: Date.now() })
    timerRef.current = setTimeout(() => setToast(null), duration)
  }, [duration])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return [toast, showToast]
}

export default function Toast({ toast }) {
  if (!toast) return null
  const Icon = toast.type === 'error' ? CircleAlert : CircleCheck
  return (
    <div
      key={toast.id}
      className={`toast ${toast.type}`}
      role="status"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon aria-hidden="true" />
      <span>{toast.message}</span>
    </div>
  )
}
