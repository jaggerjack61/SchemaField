# SchemaField

A modern, schematic data capture platform for professionals. Transform chaos into structure with a seamless, type-safe schema layer.

**Repository:** [https://github.com/jaggerjack61/SchemaField.git](https://github.com/jaggerjack61/SchemaField.git)

## Prerequisites

- **Python** 3.8+
- **Node.js** 16+
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
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

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

#### Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

#### One-Command Start (Windows)

Run `start.bat` from the project root to automatically set up the venv, install dependencies, run migrations, and start both backend and frontend in separate windows.

---

## API Overview

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /api/auth/login/` | Obtain JWT token |
| `GET /api/auth/me/` | Current user info |
| `POST /api/auth/change-password/` | Change password |
| `/api/forms/` | CRUD for forms (with sections, questions, choices) |
| `/api/users/` | User management (admin) |
| `/api/permissions/` | Form permission management |
| `POST /api/upload-question-media/` | Upload media for questions |

---

## Features

### Forms & Data Capture

- **Schema-driven forms** with sections, ordered questions, and typed fields
- **Question types:** short text, long text, number, float, multiple choice, multiple select, media upload
- **Form deadlines** with automatic closing
- **QR code generation** for every form (auto-generated on creation)
- **Public form sharing** via unique `share_id` links (`/f/{shareId}`)
- **Per-user form archiving** without affecting other collaborators

### Collaboration & Permissions

- **Form-level permissions** — grant `edit` or `view_responses` access to other users
- Owners and permitted users can manage forms and view responses

### Responses & Analytics

- **Response collection** with text, file, and choice-based answers
- **Form analytics** dashboard (`/forms/:id/responses/analytics`)
- **Response viewer** with per-form breakdown (`/forms/:id/responses`)

### Admin Panel

- **User management** — view, edit, and manage users (`/admin/users`)
- **File management** — view and manage uploaded files (`/admin/files`)

### User Account

- **Profile page** (`/profile`)
- **Password change** support

---

## Frontend Routes

| Route | Page | Access |
|---|---|---|
| `/` | Landing page | Public |
| `/login` | Login | Public |
| `/f/:shareId` | Public form view | Public |
| `/dashboard` | Dashboard | Authenticated |
| `/profile` | User profile | Authenticated |
| `/forms/new` | Form builder | Authenticated |
| `/forms/:id/edit` | Form builder | Authenticated |
| `/forms/:id/preview` | Form preview | Authenticated |
| `/forms/:id/responses` | Form responses | Authenticated |
| `/forms/:id/responses/analytics` | Form analytics | Authenticated |
| `/admin` | Admin panel | Admin only |
| `/admin/users` | User management | Admin only |
| `/admin/files` | File management | Admin only |

---

## Convenience Scripts

| Script | Description |
|---|---|
| `start.bat` | One-command Windows startup (venv setup, migrations, both servers) |
| `g.bat` | Git helper — `g.bat "message"` to add/commit/push, `-p` to pull, `-b <branch>` to checkout |

---

## License

[MIT](LICENSE)
