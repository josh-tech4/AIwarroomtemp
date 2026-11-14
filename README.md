# AI WarRoom

**Virtual Business Simulation & Decision Intelligence Platform**

> Test business assumptions and decisions in a controlled virtual environment before committing real money, time or operational resources.

AI WarRoom does not guarantee business success, predict the future with certainty, or replace professional financial, legal, or operational advice. It provides deterministic scenario analysis based on declared assumptions and evidence-linked AI interpretation.

---

## One-Command Local Run (Windows — Fastest)

```powershell
.\run-local.ps1
```

This applies migrations (using local SQLite when `USE_SQLITE=True` in `.env`), seeds the illustrative demo business (`demo@aiwarroom.local` / `DemoPass123!`), starts Django on http://localhost:8000, and starts React/Vite on http://localhost:5173.

---

## Quick Start (Docker + PostgreSQL)

### Prerequisites
- Docker Desktop / Docker Engine + Docker Compose

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD and DJANGO_SECRET_KEY
```

### 2. Start Services

```bash
docker-compose up --build
```

### 3. Seed Demo Data (Optional)

```bash
docker-compose exec backend python manage.py seed_demo
```

### 4. Access

| Service | URL |
|---|---|
| Frontend (Vite dev) | http://localhost:5173 |
| Backend API | http://localhost:8000/api/v1/ |
| Swagger / OpenAPI Docs | http://localhost:8000/api/docs/ |
| Health Check | http://localhost:8000/health/ |
| Django Admin | http://localhost:8000/admin/ |

---

## Manual Local Development (Two Terminals)

### Terminal 1 — Backend

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py runserver
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173 and log in with `demo@aiwarroom.local` / `DemoPass123!` (or register a new account).

### Running Backend & Frontend Tests

```powershell
cd backend
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\ruff.exe format --check .
.\.venv\Scripts\pytest.exe -v

cd ..\frontend
npm run type-check
npm run lint
npm test -- --run
```

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django cryptographic secret key | (required in prod) |
| `POSTGRES_DB` | PostgreSQL database name | `aiwarroom` |
| `POSTGRES_USER` | PostgreSQL user | `aiwarroom` |
| `POSTGRES_PASSWORD` | PostgreSQL password | (required) |
| `POSTGRES_HOST` | PostgreSQL host | `db` |
| `AI_PROVIDER` | `mock` (dev/CI) or `gemini` | `mock` |
| `GEMINI_API_KEY` | Google Gemini API key (only when `AI_PROVIDER=gemini`) | `""` |

---

## Architecture & Docs

- [Architecture Overview](docs/architecture.md)
- [Entity-Relationship Diagram](docs/erd.mmd)
- [Simulation Formulas & Assumptions](docs/formulas.md)
- [Sample API Requests](docs/api_examples.md)
- [Known Limitations & Roadmap](docs/roadmap.md)

