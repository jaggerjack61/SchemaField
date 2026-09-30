export default function EmptyState({ icon: Icon, title, description, action, tone, bordered = false }) {
  return (
    <div className={`empty-state ${bordered ? 'empty-state-bordered' : ''}`}>
      {Icon && (
        <div className={`empty-state-icon ${tone ? `tone-${tone}` : ''}`}>
          <Icon aria-hidden="true" />
        </div>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
