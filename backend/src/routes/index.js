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
import * as users from '../controllers/userController.js';
import * as billing from '../controllers/billingController.js';

const router = Router();

/* ---------------------------- Public ---------------------------- */
router.post('/auth/login', auth.login);
// The login screen needs the pump's name before anyone has signed in.
router.get('/branding', settings.getPublicBranding);

/* ------------------------ Authenticated ------------------------- */
router.get('/auth/me', requireAuth, auth.me);

// Only an admin can create accounts.
/* ------------------------- Staff accounts ------------------------ */
// Creating and removing the people who can sign in. Admin only.
router.get('/users',                  requireAuth, requireRole('admin'), users.listUsers);
router.post('/users',                 requireAuth, requireRole('admin'), users.createUser);
router.patch('/users/:id',            requireAuth, requireRole('admin'), users.updateUser);
router.post('/users/:id/password',    requireAuth, requireRole('admin'), users.resetPassword);
router.delete('/users/:id',           requireAuth, requireRole('admin'), users.deactivateUser);

// Kept for compatibility with anything already calling the old paths.
router.post('/auth/register', requireAuth, requireRole('admin'), auth.register);
router.get('/auth/users',     requireAuth, requireRole('admin'), users.listUsers);

/* ----------------------------- Profile --------------------------- */
// Every signed-in user edits their OWN details — attendants and fleet managers
// included. No role check is needed: each handler scopes to req.user.userId,
// so there is no way to reach another account regardless of role.
router.get('/profile',                     requireAuth, profile.getProfile);
router.put('/profile',                     requireAuth, profile.updateProfile);
router.put('/profile/password',            requireAuth, profile.changePassword);
router.get('/profile/notifications',       requireAuth, profile.listNotifications);
router.post('/profile/notifications/test', requireAuth, profile.sendTestNotification);

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
/* ----------------------------- Billing --------------------------- */
// Invoices run on fortnightly cycles: 1st–15th and 16th–end of month.
router.get('/clients/:id/invoice',      requireAuth, requireRole('admin', 'manager'), billing.getInvoice);
router.post('/clients/:id/invoice/send', requireAuth, requireRole('admin'), billing.sendInvoice);
router.get('/billing/dispatches',        requireAuth, requireRole('admin'), billing.listDispatches);

// The permanent archive: every invoice ever issued, across every client.
router.get('/invoices',      requireAuth, requireRole('admin'), billing.listInvoices);
router.get('/invoices/:id',  requireAuth, requireRole('admin', 'manager'), billing.getArchivedInvoice);

// Triggered by Vercel Cron each morning; only acts on the 1st and the 16th.
// Guarded by CRON_SECRET rather than a session, since no user is signed in.
router.post('/billing/run', billing.runScheduledBilling);
router.get('/billing/run',  billing.runScheduledBilling);

export default router;
