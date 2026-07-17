from pathlib import Path


MAX_MEDIA_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_SUBMISSION_UPLOAD_SIZE = 25 * 1024 * 1024

ALLOWED_MEDIA_TYPES = {
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/mp4',
}

ALLOWED_MEDIA_EXTENSIONS = {
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.mp4',
    '.webm',
    '.ogv',
    '.mp3',
    '.ogg',
    '.wav',
    '.m4a',
}


def media_upload_error(uploaded_file):
    """Return a user-facing error when an uploaded media file is not allowed."""
    if uploaded_file is None:
        return None

    content_type = (getattr(uploaded_file, 'content_type', '') or '').lower()
    if content_type not in ALLOWED_MEDIA_TYPES:
        return f'Unsupported file type: {content_type or "unknown"}'

    extension = Path(getattr(uploaded_file, 'name', '')).suffix.lower()
    if extension not in ALLOWED_MEDIA_EXTENSIONS:
        return f'Unsupported file extension: {extension or "none"}'

    if getattr(uploaded_file, 'size', 0) > MAX_MEDIA_UPLOAD_SIZE:
        return 'File too large. Maximum size is 10 MB.'

    return None
