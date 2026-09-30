import { useEffect } from 'react'

// Close a popover when the user clicks outside `ref` or presses Escape.
export default function useDismiss(ref, open, onDismiss) {
  useEffect(() => {
    if (!open) return
    function handlePointer(event) {
      if (ref.current && !ref.current.contains(event.target)) onDismiss()
    }
    function handleKey(event) {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [ref, open, onDismiss])
}
