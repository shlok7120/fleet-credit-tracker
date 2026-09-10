/**
 * Installation-wide branding: who this pump is.
 *
 * There is exactly one row (enforced by CHECK (id = 1)), so "the settings"
 * is never ambiguous.
 */
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_BYTES = 400 * 1024;

/**
 * The subset safe to serve without authentication.
 *
 * The login screen has to show the pump's name before anyone has signed in,
 * but it has no business exposing the GSTIN or contact details to the open
 * internet, so those stay behind auth.
 */
export const getPublicBranding = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT pump_name, oil_company, city, logo FROM pump_settings WHERE id = 1'
  );
  res.json(rows[0] || { pump_name: 'FleetCredit', oil_company: null, city: null, logo: null });
});

export const getSettings = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM pump_settings WHERE id = 1');
  res.json(rows[0] || {});
});

export const updateSettings = asyncHandler(async (req, res) => {
  const {
    pump_name, oil_company, address, city, gstin,
    contact_email, contact_phone, logo,
  } = req.body;

  if (pump_name !== undefined && !String(pump_name).trim()) {
    return res.status(400).json({ error: 'The pump name cannot be empty.' });
  }

  let cleanLogo;
  if (logo !== undefined) {
    if (logo === null || logo === '') {
      cleanLogo = null;
    } else if (!LOGO_PATTERN.test(logo)) {
      return res.status(400).json({ error: 'Logo must be a PNG, JPEG, WebP or SVG data URL.' });
    } else {
      const bytes = Math.floor((logo.length - logo.indexOf(',') - 1) * 0.75);
      if (bytes > MAX_LOGO_BYTES) {
        return res.status(413).json({ error: 'Logo is too large. Please use one under 400 KB.' });
      }
      cleanLogo = logo;
    }
  }

  // Same "was it sent?" flags as the profile update, and for the same reason:
  // an address the proprietor deletes must actually disappear.
  const sent = (v) => v !== undefined;
  const str = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

  const { rows } = await query(
    `UPDATE pump_settings SET
       pump_name     = COALESCE($1, pump_name),
       oil_company   = CASE WHEN $2::boolean  THEN $3  ELSE oil_company END,
       address       = CASE WHEN $4::boolean  THEN $5  ELSE address END,
       city          = CASE WHEN $6::boolean  THEN $7  ELSE city END,
       gstin         = CASE WHEN $8::boolean  THEN $9  ELSE gstin END,
       contact_email = CASE WHEN $10::boolean THEN $11 ELSE contact_email END,
       contact_phone = CASE WHEN $12::boolean THEN $13 ELSE contact_phone END,
       logo          = CASE WHEN $14::boolean THEN $15 ELSE logo END,
       updated_at    = NOW()
     WHERE id = 1
     RETURNING *`,
    [
      pump_name === undefined ? null : String(pump_name).trim(),
      sent(oil_company),   str(oil_company),
      sent(address),       str(address),
      sent(city),          str(city),
      sent(gstin),         gstin ? String(gstin).trim().toUpperCase() : null,
      sent(contact_email), contact_email ? String(contact_email).trim().toLowerCase() : null,
      sent(contact_phone), str(contact_phone),
      cleanLogo !== undefined, cleanLogo ?? null,
    ]
  );

  res.json(rows[0]);
});
