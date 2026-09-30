// Up to two initials from a display name, falling back to the email's first letter.
export function getInitials(name, email) {
  if (name?.trim()) {
    return name.trim().split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 2)
  }
  return (email?.[0] || '?').toUpperCase()
}
