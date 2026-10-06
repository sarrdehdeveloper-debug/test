# Zodiac Blend

**Two Traditions. One Truth.** — Western astrology and the Chinese zodiac, blended into one reading.

* **Free plan** — birth date + email + language → Western sun sign and Chinese year animal with a
  pre-written reading (no AI call per visit).
* **Full report (paid)** — birth date, exact time and city → Sun, Moon, Ascendant and the four BaZi
  pillars are calculated in Python; after a verified payment six AI prompts (Gemini) write a personal
  report that is rendered to a branded PDF, available to download immediately and by email for 24 hours.
* **Dashboard** — offers & banner, discount codes, Galaxy Library book series, the six prompts
  (versioned), site content in every language, blog, orders, settings.

| Part | Stack |
|---|---|
| `frontend/` | Next.js 16 (App Router, TypeScript), Tailwind CSS 4, next-intl (English + Arabic RTL) |
| `backend/` | Python 3.11, FastAPI, SQLAlchemy 2, PostgreSQL 16, Alembic, lunar-python, Playwright/Chromium (PDF) |
| Worker | Same Python package; durable job queue in PostgreSQL (no separate broker) |

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design, API contract and the open client
decisions. The original brief and research are in `docs/research/`.

## Run locally

Requirements: Python 3.11, Node 22, PostgreSQL 16 (or just Docker).

### With Docker
```bash
docker compose up --build
# web: http://localhost:3000   api docs: http://localhost:8000/api/docs
docker compose exec api python -m app.cli create-admin --email you@example.com --password 'a-long-password'
```

### Without Docker
```bash
# database
createuser -s zodiac; createdb -O zodiac zodiac   # password "zodiac" or adjust ZB_DATABASE_URL

# backend
cd backend
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && python -m playwright install chromium
cp .env.example .env
alembic upgrade head
python -m app.cli import-geo --min-population 5000   # countries & cities (GeoNames, CC-BY 4.0)
python -m app.cli seed                # sample content, 6 prompts, readings (en + ar)
python -m app.cli create-admin --email you@example.com --password 'a-long-password'
uvicorn app.main:app --reload         # API on :8000
python -m app.worker                  # in a second terminal: generation, PDFs, emails, cleanup

# frontend
cd ../frontend
npm install
API_BASE_URL=http://localhost:8000 npm run dev   # http://localhost:3000, dashboard at /admin
```

With the defaults (`ZB_PAYMENT_PROVIDER=fake`, `ZB_AI_PROVIDER=fake`, `ZB_EMAIL_BACKEND=console`) the whole
paid flow works offline: a test payment page, sample AI text, and emails written to
`backend/storage/outbox/`. Switch to Stripe, Gemini and SMTP with the variables in `backend/.env.example`.

## Tests
```bash
cd backend && . .venv/bin/activate && ruff check app tests && python -m pytest
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```
Backend tests create a throw-away PostgreSQL database per run (`ZB_TEST_ADMIN_URL`, default
`postgresql+psycopg://zodiac:zodiac@localhost:5432/postgres`).
