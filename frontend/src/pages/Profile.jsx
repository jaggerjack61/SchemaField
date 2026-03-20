import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, changePassword } from '../api'

function getInitials(name, email) {
  if (name) return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (email?.[0] || '?').toUpperCase()
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
      await changePassword(currentPassword, newPassword)
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
        <div className="profile-avatar">{getInitials(user?.name, user?.email)}</div>
        <div className="profile-identity">
          <h1>{user?.name || 'User'}</h1>
          <span className="profile-email">{user?.email}</span>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-header">
          <h2>Profile</h2>
          <p className="profile-section-desc">Manage your display name. Email and role cannot be changed here.</p>
        </div>

        <div className="profile-info-row">
          <div className="profile-info-item">
            <span className="profile-info-label">Email</span>
            <span className="profile-info-value">{user?.email}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Role</span>
            <span className="profile-info-value profile-role-badge">{user?.role}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Joined</span>
            <span className="profile-info-value">{joined}</span>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="profile-form">
          <label className="profile-label">
            Display Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="profile-input"
              required
            />
          </label>
          <div className="profile-form-footer">
            {message && <p className={'profile-message' + (message.includes('updated') ? ' success' : ' error')}>{message}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <div className="profile-section">
        <div className="profile-section-header">
          <h2>Password</h2>
          <p className="profile-section-desc">Update your password. Must be at least 8 characters.</p>
        </div>
        <form onSubmit={handlePasswordChange} className="profile-form">
          <label className="profile-label">
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="profile-input"
              required
            />
          </label>
          <div className="profile-field-group">
            <label className="profile-label">
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="profile-input"
                required
                minLength={8}
              />
            </label>
            <label className="profile-label">
              Confirm
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="profile-input"
                required
                minLength={8}
              />
            </label>
          </div>
          <div className="profile-form-footer">
            {pwMessage && <p className={'profile-message' + (pwMessage.includes('successfully') ? ' success' : ' error')}>{pwMessage}</p>}
            <button type="submit" className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
