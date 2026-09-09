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

  const { rows } = await query(
    `UPDATE pump_settings SET
       pump_name     = COALESCE($1, pump_name),
       oil_company   = COALESCE($2, oil_company),
       address       = COALESCE($3, address),
       city          = COALESCE($4, city),
       gstin         = COALESCE($5, gstin),
       contact_email = COALESCE($6, contact_email),
       contact_phone = COALESCE($7, contact_phone),
       logo          = CASE WHEN $8::boolean THEN $9 ELSE logo END,
       updated_at    = NOW()
     WHERE id = 1
     RETURNING *`,
    [
      pump_name === undefined ? null : String(pump_name).trim(),
      oil_company === undefined ? null : String(oil_company).trim() || null,
      address === undefined ? null : String(address).trim() || null,
      city === undefined ? null : String(city).trim() || null,
      gstin === undefined ? null : String(gstin).trim().toUpperCase() || null,
      contact_email === undefined ? null : String(contact_email).trim().toLowerCase() || null,
      contact_phone === undefined ? null : String(contact_phone).trim() || null,
      cleanLogo !== undefined,
      cleanLogo ?? null,
    ]
  );

  res.json(rows[0]);
});
