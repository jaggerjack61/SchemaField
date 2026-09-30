import { useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, changePassword } from '../api'
import { getInitials } from '../initials'

function FormMessage({ message, success }) {
  if (!message) return null
  const Icon = success ? CircleCheck : CircleAlert
  return (
    <p className={`profile-message ${success ? 'success' : 'error'}`} role="status">
      <Icon size={14} aria-hidden="true" />
      {message}
    </p>
  )
}

export default function Profile() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMessage, setPwMessage] = useState('')

  async function handleProfileSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const { data } = await updateProfile({ name })
      setUser(data)
      setMessage('Profile updated.')
    } catch (err) {
      setMessage(err.response?.data?.name?.[0] || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPwMessage('')
    if (newPassword !== confirmPassword) {
      setPwMessage('Passwords do not match.')
      return
    }
    setPwSaving(true)
    try {
      const { data } = await changePassword(currentPassword, newPassword)
      // The password change revoked every earlier token, including this session's.
      localStorage.setItem('access_token', data.access)
      localStorage.setItem('refresh_token', data.refresh)
      setPwMessage('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const detail = err.response?.data?.current_password?.[0]
        || err.response?.data?.new_password?.[0]
        || 'Failed to change password.'
      setPwMessage(detail)
    } finally {
      setPwSaving(false)
    }
  }

  const joined = user?.date_joined
    ? new Date(user.date_joined).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="avatar avatar-lg">{getInitials(user?.name, user?.email)}</div>
        <div className="profile-identity">
          <h1>{user?.name || 'User'}</h1>
          <span className="profile-email">{user?.email}</span>
        </div>
      </div>

      <section className="card profile-section">
        <div className="profile-section-header">
          <h2>Profile</h2>
          <p>Your display name is shown to teammates you share forms with.</p>
        </div>

        <dl className="profile-info-row">
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd><span className={`badge ${user?.role === 'admin' ? 'badge-accent' : ''}`}>{user?.role}</span></dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{joined}</dd>
          </div>
        </dl>

        <form onSubmit={handleProfileSave}>
          <div className="profile-fields">
            <div className="field">
              <label className="field-label" htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input"
                autoComplete="name"
                required
              />
            </div>
          </div>
          <div className="profile-form-footer">
            <FormMessage message={message} success={message.includes('updated')} />
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </section>

      <section className="card profile-section">
        <div className="profile-section-header">
          <h2>Password</h2>
          <p>Use at least 8 characters. Changing it signs you out on other devices.</p>
        </div>
        <form onSubmit={handlePasswordChange}>
          <div className="profile-fields">
            <div className="field">
              <label className="field-label" htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="input"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="input"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>
          <div className="profile-form-footer">
            <FormMessage message={pwMessage} success={pwMessage.includes('successfully')} />
            <button type="submit" className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
