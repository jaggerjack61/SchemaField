import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pageSize, count, onPage, disabled = false }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <nav className="pagination-controls" aria-label="Pagination">
      <span className="pagination-info">
        Page <strong>{page}</strong> of <strong>{pages}</strong> · {count} total
      </span>
      <div className="pagination-buttons">
        <button className="btn btn-secondary btn-sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft aria-hidden="true" />
          Previous
        </button>
        <button className="btn btn-secondary btn-sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
