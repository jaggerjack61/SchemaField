import { useId } from 'react'

// Brand mark: three stacked "fields" on the accent tile.
export default function Logo({ size = 26 }) {
  const gradientId = useId()
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <rect x="8" y="9" width="16" height="3" rx="1.5" fill="#fff" />
      <rect x="8" y="14.5" width="11" height="3" rx="1.5" fill="#fff" fillOpacity="0.78" />
      <rect x="8" y="20" width="6" height="3" rx="1.5" fill="#fff" fillOpacity="0.55" />
    </svg>
  )
}
