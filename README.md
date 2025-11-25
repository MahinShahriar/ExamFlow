# ExamFlow

End-to-end exam management application (FastAPI backend + React + Vite frontend).

## Repository layout
- `backend/` — FastAPI application and Python code.
- `frontend/` — React + Vite frontend (TypeScript).

## Quick overview
- Backend entrypoint: `backend/main.py` (runs uvicorn with `app.app:app`).
- Frontend: files under `frontend/` and uses Vite for development.

## Features
- Question bank with pagination, filtering and search
- Excel import for questions
- Create and schedule exams
- Auto-grading for objective questions
- Manual grading for text and image answers
- Autosave and resume exam support
- Admin panel for publish/unpublish and reviewing student submissions
- Student dashboard with timer, answer types (single, multiple, text, image) and result pages

## Prerequisites
- Linux, macOS, or Windows with POSIX-like shell
- Python 3.11+
- Node.js 16+ and npm (or pnpm/yarn)
- PostgreSQL 14+

## Checklist (high level)
1. Create & activate Python virtual environment for backend.
2. Install backend dependencies (Poetry or pip).
3. Configure PostgreSQL database with a schema.
4. Set environment variables for backend configuration.
5. Start backend with uvicorn.
6. Install frontend dependencies and start the Vite dev server.
7. Open the frontend in the browser.

---

## Backend — setup and run

1. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

- With Poetry (preferred when `pyproject.toml` is present):

```bash
cd backend
poetry install
```

- Or with pip:

```bash
cd backend
pip install -r requirements.txt   # if present
# or
pip install -e .
```

3. Configure PostgreSQL database:

```sql
CREATE DATABASE examflow_db;
CREATE SCHEMA <schema_name>;  -- replace <schema_name> with your desired schema 
```

4. Set the connection in environment variables (example):
create a file named `.env` in the `backend/` directory or export directly in your shell:

```bash
export DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/examflow_db"
export DATABASE_SCHEMA="<schema_name>"
export SECRET="your_secret_key_here"
```

5. Run the backend:

Option A — using the provided entrypoint:

```bash
# from repo root
uv run backend/main.py
```

Option B — run uvicorn directly:

```bash
cd backend
uvicorn app.app:app --reload --host 127.0.0.1 --port 8000
```



The backend will be available at `http://127.0.0.1:8000` by default.

5. Run backend tests:

```bash
# from repo root (with venv activated)
pytest backend -q
```

---

## Frontend — setup and run

1. Install Node dependencies:

```bash
cd frontend
npm install
# or pnpm install / yarn install
```

2. Configure API base URL (if necessary)

The frontend uses `frontend/services/api.ts` to locate the backend. By default it points to `http://localhost:8000`. Update that file or set a Vite environment variable if your backend runs on a different host/port.

3. Run the dev server:

```bash
cd frontend
npm run dev
```

Vite will show the dev URL in the terminal (commonly `http://localhost:5173`). Open that URL to use the app.

4. Build for production:

```bash
cd frontend
npm run build
npm run preview   # optional: preview the built app locally
```

---

## Running both locally (recommended)
Open two terminals:

Terminal A — Backend:

```bash
# from repo root
python backend/main.py
```

Terminal B — Frontend:

```bash
cd frontend
npm run dev
```

---

## Notes & Troubleshooting
- If deleting an `exam` causes foreign key errors, ensure your DB schema uses `ON DELETE CASCADE` or prevent deletion when dependent `exam_sessions` exist.
- If frontend dev server is not sending correct backend requests, verify `frontend/services/api.ts` and the Vite proxy configuration in `vite.config.ts`.
- For manual grading issues, ensure the backend endpoint updates a single answer's manual grade (bounded by question max) and recomputes the session total by summing all answers.

For more details, check `backend/` and `frontend/` source files.
```