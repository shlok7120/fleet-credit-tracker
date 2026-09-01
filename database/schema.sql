-- ============================================================================
-- Corporate Fleet Credit Tracker :: Schema
-- Target: PostgreSQL 17
-- Run with: psql -d fleet_tracker -f database/schema.sql
-- ============================================================================

DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS vehicles     CASCADE;
DROP TABLE IF EXISTS clients      CASCADE;
DROP TABLE IF EXISTS users        CASCADE;
DROP TYPE  IF EXISTS user_role    CASCADE;
DROP TYPE  IF EXISTS fuel_type    CASCADE;

-- ---------------------------------------------------------------------------
-- Enumerated types: the database itself refuses an invalid role or fuel type.
-- ---------------------------------------------------------------------------
CREATE TYPE user_role  AS ENUM ('admin', 'manager', 'attendant');
CREATE TYPE fuel_type  AS ENUM ('petrol', 'diesel', 'cng');

-- ---------------------------------------------------------------------------
-- USERS - every human who can log in.
-- We never store a password, only a bcrypt hash of it.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    full_name     VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role    NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CLIENTS - the corporate fleets that buy fuel on credit.
-- current_balance = how much they currently OWE the pump.
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
    client_id        SERIAL PRIMARY KEY,
    company_name     VARCHAR(150)   NOT NULL UNIQUE,
    contact_person   VARCHAR(100),
    contact_phone    VARCHAR(20),
    credit_limit     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    current_balance  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    manager_user_id  INTEGER        REFERENCES users(user_id) ON DELETE SET NULL,
    is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- VEHICLES - each truck/car belonging to a client fleet.
-- ON DELETE CASCADE: removing a client removes its vehicles.
-- ---------------------------------------------------------------------------
CREATE TABLE vehicles (
    vehicle_id     SERIAL PRIMARY KEY,
    client_id      INTEGER      NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    license_plate  VARCHAR(20)  NOT NULL UNIQUE,
    make_model     VARCHAR(100),
    fuel           fuel_type    NOT NULL,
    tank_capacity  NUMERIC(6,2) NOT NULL CHECK (tank_capacity > 0),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TRANSACTIONS - one fuelling event logged at the dispenser.
-- is_flagged / fraud_score / flag_reason are written by the Python ML service.
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
    txn_id          SERIAL PRIMARY KEY,
    vehicle_id      INTEGER        NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
    attendant_id    INTEGER        REFERENCES users(user_id) ON DELETE SET NULL,
    volume_liters   NUMERIC(8, 2)  NOT NULL CHECK (volume_liters > 0),
    price_per_liter NUMERIC(6, 2)  NOT NULL CHECK (price_per_liter > 0),
    total_cost      NUMERIC(10, 2) NOT NULL CHECK (total_cost > 0),
    odometer_km     INTEGER,
    is_flagged      BOOLEAN        NOT NULL DEFAULT FALSE,
    fraud_score     NUMERIC(5, 4),
    flag_reason     TEXT,
    txn_timestamp   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes: these make the dashboard queries fast once the table grows.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_vehicles_client       ON vehicles(client_id);
CREATE INDEX idx_txn_vehicle           ON transactions(vehicle_id);
CREATE INDEX idx_txn_timestamp         ON transactions(txn_timestamp DESC);
CREATE INDEX idx_txn_flagged           ON transactions(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_clients_manager       ON clients(manager_user_id);
