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

## Admin profile, branding and alerts

The admin (only) can edit their own profile at **Settings**: name, designation,
email, phone, photo, and password. Handlers act on the id inside the JWT, never
on one from the request body, so no account can edit another. To open profile
editing to every role, remove `requireRole('admin')` from the five `/profile`
lines in `backend/src/routes/index.js`.

**Photos** are centre-cropped and resized to 256px *in the browser* before
upload — a 1.4 MB phone photo becomes about 4 KB. That is why avatars live in a
database column instead of requiring S3 or Vercel Blob. The server independently
rejects non-images and anything over 400 KB, because a browser-side check
protects nobody.

**Pump details** (name, oil company, address, GSTIN, logo) replace the product
name on the sign-in screen, in the sidebar, on the browser tab and on every
invoice. There is exactly one settings row, enforced by `CHECK (id = 1)`.
Reseeding deliberately leaves it alone: branding is configuration, not demo data.

### Billing cycles

Invoices run **fortnightly**: the 1st–15th and the 16th–end of month. A cycle is
identified by a period string like `2026-09-H2`.

Every boundary is computed in `PUMP_TIMEZONE`, never the server's. Timestamps
are TIMESTAMPTZ and the servers run in UTC, so a fill at 00:30 IST on the 16th
is 19:00 UTC on the 15th — read naively it lands in the wrong fortnight and the
client receives an invoice that is genuinely wrong. Bounds are built as local
midnight and are half-open `[start, end)`, so a fill at exactly midnight on the
16th bills once, in the later cycle. Verified: the two halves of a month sum
exactly to the whole month.

### The invoice archive

An issued invoice is an accounting record, so it is stored rather than
recalculated. Each row in `invoice_dispatches` carries a JSONB `snapshot` of
the whole document — line items, totals, the client's credit position and the
pump's details as they stood at issue — plus a consecutive `invoice_no` from a
sequence, which GST requires.

This matters because recomputing is not safe: deactivate a vehicle, correct a
fill, and last fortnight's figures quietly become something the client never
received. Verified by deleting 29 transactions underneath an issued invoice —
its totals and line items were unchanged. An *unissued* cycle still recomputes
live, since it is a preview rather than a record.

Issuing and delivering are separate. The invoice is archived the moment it is
issued, whether or not email is configured and whether or not delivery later
succeeds; `status` describes only the delivery attempt. Admins browse every
client's invoices under **Billing → Invoice archive**, filterable by client and
cycle, and open any one exactly as it was issued.

`invoice_dispatches` records every invoice sent, with `UNIQUE (client_id,
period)`. That constraint is the safeguard — the scheduled job may be retried,
but a client can never receive the same fortnight twice, and the database
enforces it rather than the job remembering.

Invoices go to `clients.billing_email`, falling back to the fleet manager's own
address. A cycle with no fuelling is skipped rather than sent as a zero
invoice, which would only train clients to ignore the emails.

Dispatch is automatic via Vercel Cron (`backend/vercel.json`), which calls
`/api/billing/run` daily at 03:00 UTC. On any day other than the 1st or 16th it
does nothing. Set `CRON_SECRET` on the API project so the endpoint cannot be
fired by anyone who finds the URL. Admins can also send manually from
**Billing**.

### Staff accounts

**Staff** (admin only) creates and removes the people who can sign in —
attendants, fleet managers and other admins — with an in-place password reset
that does not require knowing the old one.

Accounts are deactivated, never deleted. A user is referenced by every
transaction they logged; dropping the row would either destroy that history or
leave transactions with no attendant. Two lockout guards are enforced in the
API, not just hidden in the UI: you cannot deactivate or demote yourself, and
the last active admin cannot be removed.

A new client can be created together with its fleet manager's login in one
step, inside a single transaction — so a failed username never leaves a client
with a half-made manager attached. Removing a client warns if money is still
outstanding, because deactivation does not cancel the debt.

**Profile editing is open to every role.** Each handler scopes to the id inside
the caller's token, so no role check is needed to keep one account out of
another. Pump details stay admin-only, and the settings page hides that tab
from non-admins.

### Notifications

Two events fan out to admins who opt in:

| Event | Fires when |
|---|---|
| `fraud_alert` | the anomaly model flags a fill, with vehicle, amount and reason |
| `credit_limit` | a fleet passes 90% of its limit — before a fill has to be refused |

Every message is written to the `notifications` table **before** any provider is
called, so there is an auditable record of what the system decided to send even
when nothing is configured. Those rows read `skipped`, not silence. Sending never
blocks the attendant: a slow email API is not somebody's problem while a truck
waits at the pump.

To switch email on, add these to the API project and redeploy:

```
RESEND_API_KEY=re_xxxxxxxx
NOTIFY_FROM_EMAIL=alerts@yourdomain.com
NOTIFY_FROM_NAME=F.M. Amin & Co.
```

Until then the app works exactly the same and the UI says plainly that nothing
is being delivered.

**SMS is deliberately not enabled.** Indian numbers require DLT registration
with TRAI — the business registered with an operator and every template
pre-approved, typically one to two weeks with GST documents. The MSG91 and
Twilio code paths are in place; supplying `MSG91_AUTH_KEY` and
`MSG91_TEMPLATE_ID` turns them on with no code change.

### Migrations

Schema changes are versioned under `database/migrations/` and tracked in a
`schema_migrations` table:

```bash
npm run migrate
```

It is safe to run repeatedly. `schema.sql` DROPs every table, so it only runs on
an empty database — an existing installation is recorded as already baselined.

> **Order matters on an existing deployment.** The login query now reads
> columns that migration `001` adds. Run `migrate` against the production
> database *before* deploying the new API, or sign-in will fail until you do.

## Deployment

Live: **https://fleet-credit-tracker.vercel.app**

The three services cannot all live on Vercel. Vercel's serverless functions cap
at 250 MB unzipped; the ML service's dependencies (scipy, pandas, statsmodels,
scikit-learn, numpy) total 372 MB. So:

| Piece | Host | Why |
|---|---|---|
| React frontend | Vercel | Static build, what Vercel is built for |
| Node/Express API | Vercel | Serverless functions, own project |
| PostgreSQL | Neon | Vercel has no database |
| Python ML | Render | Too large for a Vercel function |

Two Vercel projects, not one. `fleet-credit-tracker` (frontend) rewrites
`/api/*` to `fleet-credit-tracker-api` (backend), so the browser only ever
talks to one origin and CORS never enters the picture.

### Environment variables

On the **API** project (`fleet-credit-tracker-api`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `JWT_SECRET` | long random string |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `ML_SERVICE_URL` | the Render service URL |
| `ML_TIMEOUT_MS` | `15000` — Render's free tier sleeps and takes ~30s to wake |

### Setting up the database

```bash
DATABASE_URL="postgresql://..." npm run migrate   # create tables
DATABASE_URL="postgresql://..." npm run seed      # demo data
DATABASE_URL="postgresql://..." npm run backfill  # train model + score history
```

`migrate` refuses to run against a database that already holds transactions,
since the schema drops every table. Pass `--force` if wiping is intended.

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
