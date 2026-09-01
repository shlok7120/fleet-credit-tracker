# Corporate Fleet Credit Tracker

Digitises the manual credit ledger at a petrol pump. Corporate fleets fuel on
credit; this system tracks every litre, enforces credit limits in real time,
generates monthly invoices, and uses machine learning to flag transactions that
look like fuel theft.

---

## Architecture

Three services talk over HTTP. Each does the job its language is best at.

```
                  ┌─────────────────┐
   Browser  ──▶   │   frontend/     │   React 19 + Tailwind 4   :5173
                  └────────┬────────┘
                           │  JSON + JWT
                           ▼
                  ┌─────────────────┐
                  │   backend/      │   Node + Express          :5001
                  │  "the brain"    │   auth, credit rules, billing
                  └───┬─────────┬───┘
                      │         │  HTTP
             SQL      │         ▼
                      │   ┌─────────────────┐
                      │   │   ml-service/   │   Python + FastAPI :8000
                      │   │  "the analyst"  │   fraud + forecasting
                      │   └─────────────────┘
                      ▼
              ┌──────────────┐
              │  PostgreSQL  │                                  :5432
              └──────────────┘
```

**Why two backends?** Python owns the ML ecosystem (scikit-learn, statsmodels);
Node owns the web/API ecosystem. Splitting them means neither is compromised.
The ML service is an **advisor, not a gatekeeper** — if Python is down, fuelling
still works, because a pump cannot stop serving trucks when a model crashes.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router 7, Recharts, lucide-react |
| Backend | Node.js, Express 4, `pg`, bcryptjs, jsonwebtoken |
| ML service | FastAPI, scikit-learn (Isolation Forest), statsmodels (ARIMA), pandas |
| Database | PostgreSQL 17 |

---

## Roles

| Role | Sees |
|---|---|
| **Pump Admin** | Every client, total credit exposure, revenue trend, all fraud alerts, client & payment management |
| **Fleet Manager** | Only their own company: vehicles, consumption charts, ARIMA demand forecast, monthly invoices |
| **Pump Attendant** | A fast-entry dispenser screen — search plate, tap a preset volume, record the fill |

Role enforcement lives in **Express middleware** (`requireRole`), not in React.
The React guard only decides what to render; anyone can edit JavaScript in their
own browser, but nobody can edit the server.

---

## Setup

Prerequisites: Node.js 18+, Python 3.10+, PostgreSQL 17, all installed.

```bash
# 1. Database
createdb fleet_tracker
psql -d fleet_tracker -f database/schema.sql

# 2. Backend
cd backend && npm install
cp .env.example .env        # then set PGUSER to your macOS username

# 3. ML service
cd ../ml-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python train.py

# 4. Frontend
cd ../frontend && npm install
```

### Load demo data

Start the ML service first (the backfill step needs it), then:

```bash
cd backend && npm run reset
```

`npm run reset` = `seed` (90 days of realistic history, with planted anomalies)
+ `backfill` (trains the model on that real history, then scores every row).

---

## Running

```bash
./start.sh
```

Or in three terminals:

```bash
cd ml-service && source venv/bin/activate && uvicorn main:app --reload --port 8000
```
```bash
cd backend && npm run dev
```
```bash
cd frontend && npm run dev
```

Then open **http://localhost:5173**

### Demo logins

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Pump Admin |
| `mgr_bluestar` | `manager123` | Fleet Manager |
| `sunita` | `attendant123` | Pump Attendant |

---

## How the fraud detection works

A **hybrid** of a statistical model and explicit rules, because each covers the
other's weakness.

**Isolation Forest** (unsupervised) learns what this pump's normal traffic looks
like across five features — fill ratio, hour of day, gap since last fill, volume
versus the vehicle's own average, and fuelling frequency — then isolates points
that sit far from that mass. It is good at "this is statistically weird" but
cannot explain itself.

**Rules** supply the explanation, and are split into two tiers:

- **Hard** — physically impossible. More fuel dispensed than the tank holds; a
  large refill hours after the last one. One hit flags the transaction outright.
- **Soft** — suspicious but innocently explainable. A 3 a.m. fill; volume far
  above the vehicle's own average. **One soft signal alone does not flag.** Two
  soft signals, or one plus model agreement, does.

That tiering matters. An earlier version flagged any fill after 11 p.m., which
buried the admin in false positives — and an alert list nobody reads is worse
than no fraud detection at all.

**Measured on the seeded dataset** (the seed randomises, so figures move a
little between runs):

| Category | Caught |
|---|---|
| Planted overfills (hard rule) | 100% |
| Planted micro-dispenses | 100% |
| Planted odd-hours fills | 67–100% |
| Ordinary traffic (false positives) | ~1.6% |

Odd-hours recall is deliberately below 100%. A 3 a.m. fill is a *soft* signal:
on its own, with nothing else unusual about it, it is not flagged. Forcing that
category to 100% would mean flagging every late-night fill, which is exactly the
false-positive flood the tiering exists to prevent. Missing a lone odd-hours
fill is the price of an alert list the admin will actually read.

The model is trained on **real transaction history**, not synthetic data.
Synthetic data is only the cold-start bootstrap for a brand-new install.
Training on synthetic patterns and scoring real traffic produced a 15.8%
false-positive rate; retraining on the pump's actual history dropped it to 3.1%.

## How the forecasting works

`ARIMA(2, 1, 2)` over 90 days of daily litres per client: two autoregressive
lags, one difference to remove trend, two moving-average terms. It projects the
next 14 days so the pump knows how much stock to hold and the client knows
whether their credit line will last the month. With under 21 days of history it
falls back to a moving average rather than fitting noise.

---

## Project layout

```
fleet-credit-tracker/
├── database/schema.sql        tables, enums, indexes
├── backend/
│   └── src/
│       ├── server.js          Express entry point
│       ├── config/db.js       connection pool + transaction helper
│       ├── middleware/        JWT auth, role guards, error handling
│       ├── controllers/       auth, clients, vehicles, transactions, dashboards
│       ├── routes/index.js    every route + its permissions, in one file
│       └── utils/
│           ├── mlClient.js    HTTP client for the Python service
│           ├── seed.js        demo data generator
│           └── backfill.js    retrain on real data + score all history
├── ml-service/
│   ├── main.py                FastAPI app + rule engine
│   ├── features.py            feature engineering (shared by train + serve)
│   ├── train.py               Isolation Forest training
│   ├── forecasting.py         ARIMA
│   └── requirements.txt
└── frontend/
    └── src/
        ├── lib/api.js         axios instance, JWT interceptors
        ├── context/           AuthContext
        ├── components/ui/     card, button, input, badge, table, charts
        └── pages/             login, admin/, manager/, attendant/
```

---

## API reference

| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any |
| POST | `/api/auth/register` | admin |
| GET | `/api/clients` | admin, manager |
| POST | `/api/clients` | admin |
| POST | `/api/clients/:id/payments` | admin |
| GET | `/api/clients/:id/forecast` | admin, manager |
| GET | `/api/clients/:id/invoice` | admin, manager |
| GET | `/api/vehicles` | admin, manager |
| GET | `/api/vehicles/lookup` | any |
| POST | `/api/vehicles` | admin, manager |
| GET | `/api/transactions` | admin, manager |
| POST | `/api/transactions` | attendant, admin |
| PATCH | `/api/transactions/:id/resolve` | admin |
| GET | `/api/dashboard/admin` | admin |
| GET | `/api/dashboard/manager` | manager |
| GET | `/api/dashboard/attendant` | attendant, admin |

ML service (internal): `POST /predict/fraud`, `POST /predict/forecast`,
`POST /train`, `GET /health`. Interactive docs at http://localhost:8000/docs

---

## Security notes

- Passwords are bcrypt-hashed (cost 10). Plain passwords never reach the
  database or the logs.
- Login returns the same generic error for an unknown username and a wrong
  password, so the API cannot be used to discover which accounts exist.
- Every query is parameterised (`$1`, `$2`) — no string concatenation, so SQL
  injection is not possible.
- Data scoping happens in SQL, not the UI: a manager calling `/api/clients`
  directly still only receives their own company.
- Recording a fill and billing for it happen inside one SQL transaction, so it
  is never possible to dispense fuel without charging for it.
- `.env` is gitignored. Never commit it — it holds the JWT signing secret.
