/**
 * Fortnightly billing cycles.
 *
 * The pump bills twice a month: the 1st to the 15th, and the 16th to the last
 * day. A cycle is identified by a period string like "2026-09-H1".
 *
 * Every boundary is computed in the PUMP's timezone, never the server's.
 * Timestamps are stored as TIMESTAMPTZ (UTC underneath), and the servers run
 * in UTC — so a fill at 00:30 IST on the 16th is 19:00 UTC on the 15th. Read
 * naively it would be billed in the wrong fortnight, and the client would
 * dispute an invoice that is genuinely wrong. Boundaries are therefore built
 * as local midnight in PUMP_TIMEZONE and handed to Postgres as such.
 */
import { PUMP_TIMEZONE } from './time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PERIOD_PATTERN = /^(\d{4})-(\d{2})-H([12])$/;

/** Today's calendar date at the pump, as {year, month, day}. */
export const pumpToday = (date = new Date(), timeZone = PUMP_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get('year'), month: get('month'), day: get('day') };
};

const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Which cycle a given calendar date falls in. */
export const periodFor = ({ year, month, day }) =>
  `${year}-${pad(month)}-H${day <= 15 ? 1 : 2}`;

export const currentPeriod = (date = new Date(), tz = PUMP_TIMEZONE) =>
  periodFor(pumpToday(date, tz));

/** The cycle immediately before the given one. */
export const previousPeriod = (period) => {
  const m = PERIOD_PATTERN.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  let [, y, mo, half] = m;
  y = Number(y); mo = Number(mo);

  if (half === '2') return `${y}-${pad(mo)}-H1`;
  // H1 rolls back to the second half of the previous month.
  if (mo === 1) return `${y - 1}-12-H2`;
  return `${y}-${pad(mo - 1)}-H2`;
};

/**
 * Half-open date bounds for a cycle: [start, end).
 * Half-open is what makes a fill at exactly midnight on the 16th land in H2
 * and never in both halves.
 */
export const periodBounds = (period) => {
  const m = PERIOD_PATTERN.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const half = Number(m[3]);

  if (half === 1) {
    return {
      start: `${year}-${pad(month)}-01`,
      end: `${year}-${pad(month)}-16`,
      firstDay: 1,
      lastDay: 15,
      year, month, half,
    };
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    start: `${year}-${pad(month)}-16`,
    end: `${nextYear}-${pad(nextMonth)}-01`,
    firstDay: 16,
    lastDay: lastDayOf(year, month),
    year, month, half,
  };
};

/** "16–30 Sep 2026" */
export const periodLabel = (period) => {
  const b = periodBounds(period);
  return `${b.firstDay}–${b.lastDay} ${MONTHS[b.month - 1]} ${b.year}`;
};

/** "1st–15th" or "16th–30th", for prose. */
export const periodShort = (period) => {
  const b = periodBounds(period);
  return `${b.firstDay}–${b.lastDay}`;
};

/** The most recent `count` cycles, newest first — used to populate a dropdown. */
export const recentPeriods = (count = 8, date = new Date(), tz = PUMP_TIMEZONE) => {
  const out = [];
  let p = currentPeriod(date, tz);
  for (let i = 0; i < count; i++) {
    out.push({ period: p, label: periodLabel(p) });
    p = previousPeriod(p);
  }
  return out;
};

/**
 * Is today the first day of a new cycle at the pump?
 * Returns the cycle that just closed, or null on any other day.
 */
export const closedPeriodIfToday = (date = new Date(), tz = PUMP_TIMEZONE) => {
  const today = pumpToday(date, tz);
  if (today.day !== 1 && today.day !== 16) return null;
  return previousPeriod(periodFor(today));
};
