# SchemaField

A modern, schematic data capture platform for professionals. Transform chaos into structure with a seamless, type-safe schema layer.

**Repository:** [https://github.com/jaggerjack61/SchemaField.git](https://github.com/jaggerjack61/SchemaField.git)

## Prerequisites

- **Python** (3.8+)
- **Node.js** (16+)
- **npm** or **yarn**

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/jaggerjack61/SchemaField.git
cd SchemaField
```

_(Note: If you downloaded the project manually, navigate to the project root directory)._

---

### 2. Backend Setup (Django)

Navigate to the `backend` directory:

```bash
cd backend
```

#### Create and Activate Virtual Environment

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Database Setup

Run migrations to set up the SQLite database:

```bash
python manage.py migrate
```

_(Optional) Create a superuser for the admin panel:_

```bash
python manage.py createsuperuser
```

#### Run the Backend Server

```bash
python manage.py runserver
```

The backend API will be available at `http://127.0.0.1:8000`.

---

### 3. Frontend Setup (React + Vite)

Open a new terminal and navigate to the `frontend` directory:

```bash
cd frontend
```

#### Install Dependencies

```bash
npm install
# or
yarn install
```

#### Environment Variables

Create a `.env` file in the `frontend` directory if needed (defaults are usually configured in code for local dev), or ensure the API URL points to the backend (default `http://127.0.0.1:8000`).

#### Run the Frontend Development Server

```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:5173` (or the port shown in the terminal).

## Usage

1.  Open your browser and navigate to the frontend URL (e.g., `http://localhost:5173`).
2.  Register a new account or log in.
3.  Create new forms ("Schemas"), add questions, and publish them.
4.  Share the form link to collect data.
5.  View responses in the Dashboard.

## License

[MIT](LICENSE)
