/**
 * Pump-local time.
 *
 * Timestamps are stored as TIMESTAMPTZ, which is correct — but "is this fill
 * at a suspicious hour?" is a question about the FORECOURT's wall clock, not
 * the server's. Locally those matched (both IST) and the bug was invisible.
 * In production Vercel's Node runs in UTC and Neon's session is UTC, so
 * 03:00 UTC — a perfectly ordinary 08:30 IST morning fill — was being flagged
 * as out-of-hours, while a genuine 3 a.m. IST fill was not.
 *
 * Everything that reasons about the hour of day must go through here.
 */
export const PUMP_TIMEZONE = process.env.PUMP_TIMEZONE || 'Asia/Kolkata';

/** Hour (0–23) at the pump, for a given instant. */
export const hourAtPump = (date = new Date(), timeZone = PUMP_TIMEZONE) =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(date)
  );
