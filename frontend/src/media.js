// Mirrors backend/forms_api/upload_validation.py so pickers only offer files
// the server will accept, and bad files are caught before they are uploaded.
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024

const MEDIA_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.mp4', '.webm', '.ogv', '.mov',
  '.mp3', '.ogg', '.wav', '.m4a', '.aac',
]

export const MEDIA_ACCEPT = [
  ...MEDIA_EXTENSIONS,
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
].join(',')

export function mediaFileError(file) {
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!MEDIA_EXTENSIONS.includes(extension)) {
    return `Unsupported file type${extension ? ` (${extension})` : ''}. Use an image, video or audio file.`
  }
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
    return 'File too large. Maximum size is 10 MB.'
  }
  return null
}

export function getMediaType(url) {
  if (!url) return null
  const ext = url.split('?')[0].split('.').pop().toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'ogv', 'mov'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio'
  return null
}
