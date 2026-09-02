/**
 * Seed script — wipes and repopulates the database with realistic demo data.
 *
 *   npm run seed        (from the backend/ folder)
 *
 * Generates 90 days of fuelling history, including a handful of deliberately
 * suspicious transactions so the fraud model has something real to catch.
 */
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pool, { query } from '../config/db.js';

dotenv.config();

const PRICE = { petrol: 104.5, diesel: 92.3, cng: 76.0 };
const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const USERS = [
  ['admin',    'R. Deshmukh (Pump Admin)', 'admin123',     'admin'],
  ['sunita',   'Sunita Rao',               'attendant123', 'attendant'],
  ['imran',    'Imran Shaikh',             'attendant123', 'attendant'],
  ['mgr_bluestar', 'Anil Kulkarni',        'manager123',   'manager'],
  ['mgr_swiftlog', 'Priya Menon',          'manager123',   'manager'],
  ['mgr_greencab', 'Rahul Jadhav',         'manager123',   'manager'],
];

const CLIENTS = [
  ['BlueStar Logistics Pvt Ltd', 'Anil Kulkarni',  '+91 98200 41122', 1500000, 'mgr_bluestar'],
  ['SwiftLog Couriers',          'Priya Menon',    '+91 98330 77219',  600000, 'mgr_swiftlog'],
  ['GreenCab Mobility',          'Rahul Jadhav',   '+91 90040 55831',  900000, 'mgr_greencab'],
  ['Konkan Freight Carriers',    'Mahesh Patil',   '+91 99870 12045',  450000, null],
  ['Metro Waste Management',     'Farida Sheikh',  '+91 91670 33908',  300000, null],
];

const VEHICLES = [
  // [company, plate, model, fuel, tank]
  ['BlueStar Logistics Pvt Ltd', 'MH12AB1234', 'Tata Prima 4928.S',  'diesel', 380],
  ['BlueStar Logistics Pvt Ltd', 'MH12AB5678', 'Ashok Leyland 3718', 'diesel', 365],
  ['BlueStar Logistics Pvt Ltd', 'MH14CD9012', 'Tata Ultra 1918.T',  'diesel', 160],
  ['BlueStar Logistics Pvt Ltd', 'MH14CD3456', 'Eicher Pro 3019',    'diesel', 150],
  ['SwiftLog Couriers',          'MH01EF2345', 'Mahindra Bolero PU', 'diesel',  60],
  ['SwiftLog Couriers',          'MH01EF6789', 'Tata Ace Gold',      'petrol',  30],
  ['SwiftLog Couriers',          'MH02GH1122', 'Maruti Super Carry', 'cng',     70],
  ['GreenCab Mobility',          'MH03IJ3344', 'Toyota Innova Crys', 'diesel',  55],
  ['GreenCab Mobility',          'MH03IJ5566', 'Maruti Dzire Tour',  'cng',     55],
  ['GreenCab Mobility',          'MH03IJ7788', 'Hyundai Aura CNG',   'cng',     60],
  ['GreenCab Mobility',          'MH04KL9900', 'Toyota Etios',       'petrol',  45],
  ['Konkan Freight Carriers',    'MH06MN1234', 'BharatBenz 2823C',   'diesel', 300],
  ['Konkan Freight Carriers',    'MH06MN5678', 'Tata Signa 4225',    'diesel', 340],
  ['Metro Waste Management',     'MH43OP1111', 'Tata LPT 1613',      'diesel', 190],
  ['Metro Waste Management',     'MH43OP2222', 'Eicher Pro 2049',    'diesel', 100],
];

async function main() {
  console.log('› Clearing existing data…');
  await query('TRUNCATE transactions, vehicles, clients, users RESTART IDENTITY CASCADE');

  // ---------------------------------------------------------------- users
  console.log('› Creating users…');
  const userIds = {};
  for (const [username, full_name, password, role] of USERS) {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (username, full_name, password_hash, role)
       VALUES ($1,$2,$3,$4) RETURNING user_id`,
      [username, full_name, hash, role]
    );
    userIds[username] = rows[0].user_id;
  }

  // -------------------------------------------------------------- clients
  console.log('› Creating clients…');
  const clientIds = {};
  for (const [name, contact, phone, limit, mgr] of CLIENTS) {
    const { rows } = await query(
      `INSERT INTO clients (company_name, contact_person, contact_phone, credit_limit, manager_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING client_id`,
      [name, contact, phone, limit, mgr ? userIds[mgr] : null]
    );
    clientIds[name] = rows[0].client_id;
  }

  // ------------------------------------------------------------- vehicles
  console.log('› Creating vehicles…');
  const vehicleRows = [];
  for (const [company, plate, model, fuel, tank] of VEHICLES) {
    const { rows } = await query(
      `INSERT INTO vehicles (client_id, license_plate, make_model, fuel, tank_capacity)
       VALUES ($1,$2,$3,$4,$5) RETURNING vehicle_id, tank_capacity, fuel, client_id`,
      [clientIds[company], plate, model, fuel, tank]
    );
    vehicleRows.push(rows[0]);
  }

  // --------------------------------------------------- 90 days of history
  console.log('› Generating 90 days of transactions…');
  const attendants = [userIds.sunita, userIds.imran];
  const balances = {};
  const pending = [];          // rows are collected, then inserted in batches
  let anomalies = 0;

  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    for (const v of vehicleRows) {
      // Big trucks refuel roughly every 3 days; small vehicles more often.
      const chance = v.tank_capacity > 200 ? 0.32 : v.tank_capacity > 80 ? 0.45 : 0.55;
      if (Math.random() > chance) continue;

      const ts = new Date();
      ts.setDate(ts.getDate() - daysAgo);
      ts.setHours(Math.floor(rand(6, 21)), Math.floor(rand(0, 60)), 0, 0);

      // Normal fill: 45%–90% of tank capacity.
      let litres = Number((Number(v.tank_capacity) * rand(0.45, 0.9)).toFixed(2));
      let odo = Math.floor(rand(20000, 260000));

      // ~1.5% of fills are deliberately anomalous, to give the model signal.
      if (Math.random() < 0.015) {
        anomalies++;
        const kind = pick(['overfill', 'midnight', 'micro']);
        if (kind === 'overfill') {
          // More fuel than the tank physically holds — classic siphoning.
          litres = Number((Number(v.tank_capacity) * rand(1.15, 1.45)).toFixed(2));
        } else if (kind === 'midnight') {
          ts.setHours(Math.floor(rand(1, 4)));
          litres = Number((Number(v.tank_capacity) * rand(0.9, 1.05)).toFixed(2));
        } else {
          litres = Number(rand(1.5, 4).toFixed(2));
        }
      }

      const price = Number((PRICE[v.fuel] * rand(0.97, 1.03)).toFixed(2));
      const cost = Number((litres * price).toFixed(2));

      pending.push([v.vehicle_id, pick(attendants), litres, price, cost, odo, ts.toISOString()]);
      balances[v.client_id] = (balances[v.client_id] || 0) + cost;
    }
  }

  // One INSERT per row means one network round trip per row. That is
  // imperceptible against a local database and painfully slow against a
  // hosted one — 650 rows to another continent is several minutes of waiting.
  // Batching them into multi-row INSERTs turns that into a handful of trips.
  const CHUNK = 250;
  const count = pending.length;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);

    // Build "($1,$2,...,$7),($8,...)" — still fully parameterised, so this is
    // not string concatenation of user data and cannot be injected.
    const values = chunk
      .map((_, r) => `(${Array.from({ length: 7 }, (_, c) => `$${r * 7 + c + 1}`).join(',')})`)
      .join(',');

    await query(
      `INSERT INTO transactions
         (vehicle_id, attendant_id, volume_liters, price_per_liter, total_cost,
          odometer_km, txn_timestamp)
       VALUES ${values}`,
      chunk.flat()
    );

    process.stdout.write(`\r  inserted ${Math.min(i + CHUNK, count)}/${count} transactions…`);
  }
  process.stdout.write('\n');

  // Clients pay most (not all) of their bill — leaving a realistic outstanding
  // balance. The balance is capped at the sanctioned credit limit: the API
  // refuses to dispense past the limit, so seeded data must respect the same
  // invariant or the dashboard shows impossible figures like 140% utilisation.
  console.log('› Settling balances…');
  const { rows: limits } = await query('SELECT client_id, credit_limit FROM clients');
  const limitBy = Object.fromEntries(limits.map((r) => [r.client_id, Number(r.credit_limit)]));

  for (const [clientId, billed] of Object.entries(balances)) {
    const limit = limitBy[clientId] ?? 0;

    // Aim for a believable 25–85% utilisation, but never invent more debt
    // than the client actually ran up.
    const target = limit * rand(0.25, 0.85);
    const outstanding = Number(Math.min(target, billed * rand(0.35, 0.8)).toFixed(2));

    await query('UPDATE clients SET current_balance = $1 WHERE client_id = $2', [outstanding, clientId]);
  }

  console.log(`\n  Seed complete`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  users          ${USERS.length}`);
  console.log(`  clients        ${CLIENTS.length}`);
  console.log(`  vehicles       ${VEHICLES.length}`);
  console.log(`  transactions   ${count}  (${anomalies} planted anomalies)`);
  console.log(`\n  Logins (username / password)`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  admin        / admin123       → Pump Admin`);
  console.log(`  mgr_bluestar / manager123     → Fleet Manager`);
  console.log(`  sunita       / attendant123   → Pump Attendant\n`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await pool.end();
  process.exit(1);
});
