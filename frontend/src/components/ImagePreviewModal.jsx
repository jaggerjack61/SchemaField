import { useEffect, useState } from 'react'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const clean = url.split(/[?#]/)[0].toLowerCase()
    return IMAGE_EXTENSIONS.some((ext) => clean.endsWith(ext))
  } catch {
    return false
  }
}

export default function ImagePreviewModal({ url, isOpen, onClose }) {
  const [loaded, setLoaded] = useState(false)
  const [loadKey, setLoadKey] = useState(0)

  // Reset loading state and force a fresh, on-demand fetch whenever the modal is opened.
  useEffect(() => {
    if (isOpen) {
      setLoaded(false)
      setLoadKey((k) => k + 1)
    }
  }, [isOpen])

  // Close on Escape key or backdrop click.
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen || !url) return null

  return (
    <div
      className="image-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="image-preview-box" onClick={(e) => e.stopPropagation()}>
        <div className="image-preview-stage">
          <button
            className="image-preview-close"
            onClick={onClose}
            aria-label="Close preview"
            type="button"
          >
            ✕
          </button>
          {!loaded && <div className="spinner" aria-label="Loading image" />}
          <img
            key={loadKey}
            className="image-preview-img"
            src={url}
            alt="Preview"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>
    </div>
  )
}

export { isImageUrl }
