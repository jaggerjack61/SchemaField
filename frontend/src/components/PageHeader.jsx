import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export default function PageHeader({ title, subtitle, back, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {back && (
          <Link to={back.to} className="page-back">
            <ChevronLeft size={16} aria-hidden="true" />
            <span>{back.label}</span>
          </Link>
        )}
        <h1 className="page-title" title={typeof title === 'string' ? title : undefined}>{title}</h1>
        {subtitle != null && <span className="page-subtitle">{subtitle}</span>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
