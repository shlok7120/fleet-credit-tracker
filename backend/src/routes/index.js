/**
 * All API routes in one place, so the permission model is readable at a glance.
 * Everything is mounted under /api by server.js.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

import * as auth from '../controllers/authController.js';
import * as clients from '../controllers/clientController.js';
import * as vehicles from '../controllers/vehicleController.js';
import * as txns from '../controllers/transactionController.js';
import * as dash from '../controllers/dashboardController.js';
import * as profile from '../controllers/profileController.js';
import * as settings from '../controllers/settingsController.js';

const router = Router();

/* ---------------------------- Public ---------------------------- */
router.post('/auth/login', auth.login);
// The login screen needs the pump's name before anyone has signed in.
router.get('/branding', settings.getPublicBranding);

/* ------------------------ Authenticated ------------------------- */
router.get('/auth/me', requireAuth, auth.me);

// Only an admin can create accounts.
router.post('/auth/register', requireAuth, requireRole('admin'), auth.register);
router.get('/auth/users', requireAuth, requireRole('admin'), auth.listUsers);

/* ----------------------------- Profile --------------------------- */
// Profile editing is admin-only, as specified. To open it to every signed-in
// user, drop the requireRole('admin') from these five lines — the handlers
// already act on req.user.userId and can never touch another account.
router.get('/profile',                 requireAuth, requireRole('admin'), profile.getProfile);
router.put('/profile',                 requireAuth, requireRole('admin'), profile.updateProfile);
router.put('/profile/password',        requireAuth, requireRole('admin'), profile.changePassword);
router.get('/profile/notifications',   requireAuth, requireRole('admin'), profile.listNotifications);
router.post('/profile/notifications/test', requireAuth, requireRole('admin'), profile.sendTestNotification);

/* ---------------------------- Settings --------------------------- */
router.get('/settings', requireAuth, requireRole('admin'), settings.getSettings);
router.put('/settings', requireAuth, requireRole('admin'), settings.updateSettings);

/* ----------------------------- Clients --------------------------- */
router.get('/clients', requireAuth, requireRole('admin', 'manager'), clients.listClients);
router.get('/clients/:id', requireAuth, requireRole('admin', 'manager'), clients.getClient);
router.post('/clients', requireAuth, requireRole('admin'), clients.createClient);
router.put('/clients/:id', requireAuth, requireRole('admin'), clients.updateClient);
router.post('/clients/:id/payments', requireAuth, requireRole('admin'), clients.recordPayment);
router.delete('/clients/:id', requireAuth, requireRole('admin'), clients.deactivateClient);

/* ---------------------------- Vehicles --------------------------- */
router.get('/vehicles', requireAuth, requireRole('admin', 'manager'), vehicles.listVehicles);
// The attendant needs the plate list to run the dispenser screen.
router.get('/vehicles/lookup', requireAuth, vehicles.lookupVehicles);
router.post('/vehicles', requireAuth, requireRole('admin', 'manager'), vehicles.createVehicle);
router.delete('/vehicles/:id', requireAuth, requireRole('admin', 'manager'), vehicles.deactivateVehicle);

/* -------------------------- Transactions ------------------------- */
router.get('/transactions', requireAuth, requireRole('admin', 'manager'), txns.listTransactions);
router.post('/transactions', requireAuth, requireRole('attendant', 'admin'), txns.createTransaction);
router.patch('/transactions/:id/resolve', requireAuth, requireRole('admin'), txns.resolveFlag);

/* --------------------------- Dashboards -------------------------- */
router.get('/dashboard/admin', requireAuth, requireRole('admin'), dash.adminDashboard);
router.get('/dashboard/manager', requireAuth, requireRole('manager'), dash.managerDashboard);
router.get('/dashboard/attendant', requireAuth, requireRole('attendant', 'admin'), dash.attendantDashboard);
router.get('/clients/:id/forecast', requireAuth, requireRole('admin', 'manager'), dash.clientForecast);
router.get('/clients/:id/invoice', requireAuth, requireRole('admin', 'manager'), dash.clientInvoice);

export default router;
