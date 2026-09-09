import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

/**
 * The pump's own identity — name, oil company, logo.
 *
 * Fetched from the public /branding endpoint so the login screen can show it
 * before anyone has signed in. Falls back to the product name if the request
 * fails, which keeps the app usable when the API is unreachable.
 */
const BrandingContext = createContext(null);

const FALLBACK = {
  pump_name: 'FleetCredit',
  oil_company: null,
  city: null,
  logo: null,
};

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    try {
      const { data } = await api.get('/branding');
      setBranding({ ...FALLBACK, ...data });
    } catch {
      setBranding(FALLBACK);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Keep the browser tab in step with the pump's name.
  useEffect(() => {
    document.title = branding.pump_name === FALLBACK.pump_name
      ? 'FleetCredit'
      : `${branding.pump_name} · FleetCredit`;
  }, [branding.pump_name]);

  const value = useMemo(() => ({ ...branding, loaded, refresh }), [branding, loaded]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
};
