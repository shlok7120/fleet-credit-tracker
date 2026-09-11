import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, HOME_FOR_ROLE } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import AppLayout from './components/AppLayout';
import { PageLoader } from './components/ui';

import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClientsPage from './pages/admin/ClientsPage';
import AlertsPage from './pages/admin/AlertsPage';
import SettingsPage from './pages/admin/SettingsPage';
import UsersPage from './pages/admin/UsersPage';
import BillingPage from './pages/admin/BillingPage';
import ManagerDashboard from './pages/manager/ManagerDashboard';
import VehiclesPage from './pages/manager/VehiclesPage';
import InvoicePage from './pages/manager/InvoicePage';
import DispenserScreen from './pages/attendant/DispenserScreen';

/**
 * Route guard.
 *
 * Note this is CONVENIENCE, not security — it only decides what to render.
 * The real enforcement is `requireRole` on the Express side, because anyone
 * can edit JavaScript in their own browser but nobody can edit our server.
 */
function Protected({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role] || '/login'} replace />;
  }
  return children;
}

/** Sends "/" to whichever dashboard suits the signed-in role. */
function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={user ? HOME_FOR_ROLE[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<Protected><AppLayout /></Protected>}>
            {/* ------------------------------ Admin ------------------------- */}
            <Route path="/admin"         element={<Protected roles={['admin']}><AdminDashboard /></Protected>} />
            <Route path="/admin/clients" element={<Protected roles={['admin']}><ClientsPage /></Protected>} />
            <Route path="/admin/alerts"  element={<Protected roles={['admin']}><AlertsPage /></Protected>} />
            <Route path="/admin/users"    element={<Protected roles={['admin']}><UsersPage /></Protected>} />
            <Route path="/admin/billing"  element={<Protected roles={['admin']}><BillingPage /></Protected>} />

            {/* Settings is every role's own profile, so it is not admin-only.
                The page itself hides the pump-details tab from non-admins. */}
            <Route path="/settings"       element={<Protected><SettingsPage /></Protected>} />
            <Route path="/admin/settings" element={<Protected roles={['admin']}><SettingsPage /></Protected>} />

            {/* ----------------------------- Manager ------------------------ */}
            <Route path="/fleet"          element={<Protected roles={['manager']}><ManagerDashboard /></Protected>} />
            <Route path="/fleet/vehicles" element={<Protected roles={['manager']}><VehiclesPage /></Protected>} />
            <Route path="/fleet/invoice"  element={<Protected roles={['manager']}><InvoicePage /></Protected>} />

            {/* ---------------------------- Attendant ----------------------- */}
            <Route path="/dispenser" element={<Protected roles={['attendant', 'admin']}><DispenserScreen /></Protected>} />
          </Route>

          <Route path="/" element={<RoleHome />} />
          <Route path="*" element={<RoleHome />} />
        </Routes>
        </BrowserRouter>
      </BrandingProvider>
    </AuthProvider>
  );
}
