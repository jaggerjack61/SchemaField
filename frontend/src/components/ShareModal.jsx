import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react'
import Modal from './Modal'

export function getShareUrl(form) {
  return `${window.location.origin}/f/${form.share_id}`
}

export default function ShareModal({ form, onClose }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  const shareUrl = getShareUrl(form)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the field stays selectable.
    }
  }

  return (
    <Modal
      title={`Share “${form.title}”`}
      description="Anyone with this link can fill out the form."
      icon={<Share2 />}
      onClose={onClose}
      footer={
        <>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            <ExternalLink aria-hidden="true" />
            Open form
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      {form.qr_code && (
        <div className="share-qr">
          <img src={form.qr_code} alt={`QR code linking to ${form.title}`} />
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="share-link">Share link</label>
        <div className="share-link-row">
          <input
            id="share-link"
            className="input"
            type="text"
            value={shareUrl}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn btn-secondary" onClick={copyShareLink}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {form.qr_code && (
        <a className="link-button share-download" href={form.qr_code} download>
          <Download size={14} aria-hidden="true" /> Download QR code
        </a>
      )}
    </Modal>
  )
}
