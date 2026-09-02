# SchemaField

A modern, schematic data capture platform for professionals. Transform chaos into structure with a seamless, type-safe schema layer.

**Repository:** [https://github.com/jaggerjack61/SchemaField.git](https://github.com/jaggerjack61/SchemaField.git)

## Prerequisites

- **Python** 3.8+
- **Node.js** 20.19+ (required by the current Vite/Vitest toolchain)
- **npm** or **yarn**

---

## Quick Start

### Docker (Recommended)

This repo includes a Docker-based dev setup that runs:

- **Backend** (Django) at `http://localhost:8000`
- **Frontend** (Vite) at `http://localhost:5173` (proxies `/api` and `/media` to the backend)

```bash
# Start the stack
docker compose up --build

# Stop
docker compose down

# Reset containers + volumes (fresh DB)
docker compose down -v
```

#### Superuser / Admin

Interactive (recommended):

```bash
docker compose exec backend python manage.py createsuperuser
```

Or set these environment variables on the `backend` service for automatic creation:

- `DJANGO_SUPERUSER_EMAIL`
- `DJANGO_SUPERUSER_NAME`
- `DJANGO_SUPERUSER_PASSWORD`

#### SQLite persistence in Docker

When running via Docker Compose, SQLite uses a named Docker volume at `/data/db.sqlite3` (not the `backend/db.sqlite3` file on your host). This avoids accidentally "sharing" a host database via the code bind mount.

---

### Manual Setup

#### Backend (Django)

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# (Optional) Create a superuser
python manage.py createsuperuser

# Start the server
python manage.py runserver
```

The backend API will be available at `http://127.0.0.1:8000`.

For a production deployment, set `DJANGO_SECRET_KEY`, keep `DEBUG=False`, and
configure `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` as comma-separated
lists. The included local start scripts and Docker Compose file set explicit
development-only values.

#### Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## API Overview

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /api/auth/login/` | Obtain JWT token |
| `POST /api/auth/token/refresh/` | Refresh an expired JWT access token |
| `GET /api/auth/me/` | Current user info |
| `PATCH /api/auth/me/` | Update profile (name) |
| `POST /api/auth/change-password/` | Change password |
| `/api/forms/` | CRUD for forms (with sections, questions, choices) |
| `GET /api/forms/by-share-id/{share_id}/` | Get form by share ID (public) |
| `POST /api/forms/{id}/submit/` | Submit a form response (public) |
| `GET /api/forms/{id}/responses/` | Paginated responses for a form |
| `GET /api/forms/{id}/export_csv/` | Stream responses as CSV |
| `POST /api/forms/{id}/archive/` | Archive a form for the current user |
| `POST /api/forms/{id}/restore/` | Restore (un-archive) a form |
| `/api/users/` | User management (admin); supports `?search=` query (filters by name/email) |
| `POST /api/users/{id}/reset_password/` | Admin reset user password |
| `GET /api/users/file-manager/summary/` | Storage usage summary (admin) |
| `GET /api/users/file-manager/browser/` | Paginated media file browser (admin) |
| `DELETE /api/users/file-manager/file/?path=` | Delete a managed file (admin) |
| `GET /api/users/file-manager/cleanup-preview/` | Preview orphaned files (admin) |
| `POST /api/users/file-manager/cleanup-orphaned-files/` | Delete orphaned files (admin) |
| `/api/permissions/` | Form permission management |
| `POST /api/upload-question-media/` | Upload media for questions |

---

## Features

### Forms & Data Capture

- **Schema-driven forms** with sections, ordered questions, and typed fields
- **Question types:** short text, long text, number, float, multiple choice, multiple select, media upload
- **Question media** — attach images/video/audio to questions (10 MB max, type-validated)
- **Form deadlines** with automatic closing
- **QR code generation** for every form (auto-generated on creation)
- **Public form sharing** via unique `share_id` links (`/f/{shareId}`)
- **Public submissions** — no auth required to submit a response
- **Per-user form archiving** without affecting other collaborators

### Collaboration & Permissions

- **Form-level permissions** — grant `edit` or `view_responses` access to other users
- Owners and permitted users can manage forms and view responses

### Responses & Analytics

- **Response collection** with text, file, and choice-based answers
- **Paginated response viewer** with per-form breakdown (`/forms/:id/responses`)
- **Spreadsheet view** for scanning responses row-by-row (`/forms/:id/responses/spreadsheet`)
- **CSV export** — streaming download of all responses (`/api/forms/{id}/export_csv/`)
- **Form analytics** dashboard (`/forms/:id/responses/analytics`)

### Admin Panel

- **User management** — view, edit, create, and reset passwords (`/admin/users`)
- **File management** — browse, delete, and clean up orphaned uploaded files (`/admin/files`)

### User Account

- **Profile page** (`/profile`) with editable name
- **Password change** support

---

## Frontend Routes

| Route | Page | Access |
|---|---|---|
| `/` | Landing page | Public |
| `/login` | Login | Public |
| `/f/:shareId` | Public form view | Public |
| `/forms/:id/view` | Form view by internal ID | Authenticated |
| `/dashboard` | Dashboard | Authenticated |
| `/profile` | User profile | Authenticated |
| `/forms/new` | Form builder | Authenticated |
| `/forms/:id/edit` | Form builder | Authenticated |
| `/forms/:id/preview` | Form preview | Authenticated |
| `/forms/:id/responses` | Form responses | Authenticated |
| `/forms/:id/responses/spreadsheet` | Form responses (spreadsheet) | Authenticated |
| `/forms/:id/responses/analytics` | Form analytics | Authenticated |
| `/admin` | Admin panel | Admin only |
| `/admin/users` | User management | Admin only |
| `/admin/files` | File management | Admin only |

---

## Convenience Scripts

| Script | Description |
|---|---|
| `backend/p.bat` | Django helper — `p` runserver, `p <port>` runserver on port, `-a` activate venv, `-m` migrate, `-m -r` refresh DB + migrate, `-cs` createsuperuser, `-c` check |

---

## License

[MIT](LICENSE)
