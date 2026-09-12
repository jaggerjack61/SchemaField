export default function Pagination({ page, pageSize, count, onPage, disabled = false }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <nav className="pagination-controls" aria-label="Pagination">
      <button className="btn btn-secondary" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>← Previous page</button>
      <span>Page {page} of {pages} · {count} total</span>
      <button className="btn btn-secondary" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>Next page →</button>
    </nav>
  )
}
