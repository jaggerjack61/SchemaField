from pathlib import Path


MAX_MEDIA_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_SUBMISSION_UPLOAD_SIZE = 25 * 1024 * 1024
# Headroom for multipart boundaries and text answers on top of the file limits.
REQUEST_OVERHEAD_ALLOWANCE = 2 * 1024 * 1024

ALLOWED_MEDIA_TYPES = {
    'image/jpeg',
    'image/pjpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/vnd.wave',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
}

ALLOWED_MEDIA_EXTENSIONS = {
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.heic',
    '.heif',
    '.mp4',
    '.webm',
    '.ogv',
    '.mov',
    '.mp3',
    '.ogg',
    '.wav',
    '.m4a',
    '.aac',
}

# Browsers send these when they do not recognise a file (e.g. HEIC on
# Windows). The extension check still applies, and it decides how the file is
# served, so accepting them does not widen what can be stored.
GENERIC_CONTENT_TYPES = {'', 'application/octet-stream'}


def media_upload_error(uploaded_file):
    """Return a user-facing error when an uploaded media file is not allowed."""
    if uploaded_file is None:
        return None

    content_type = (getattr(uploaded_file, 'content_type', '') or '').lower()
    if content_type not in ALLOWED_MEDIA_TYPES and content_type not in GENERIC_CONTENT_TYPES:
        return f'Unsupported file type: {content_type}'

    extension = Path(getattr(uploaded_file, 'name', '')).suffix.lower()
    if extension not in ALLOWED_MEDIA_EXTENSIONS:
        return f'Unsupported file extension: {extension or "none"}'

    if getattr(uploaded_file, 'size', 0) > MAX_MEDIA_UPLOAD_SIZE:
        return 'File too large. Maximum size is 10 MB.'

    return None


def request_body_too_large(request, limit):
    """Check the declared body size before anything parses (and spools) it."""
    try:
        content_length = int(request.META.get('CONTENT_LENGTH') or 0)
    except (TypeError, ValueError):
        return False
    return content_length > limit
