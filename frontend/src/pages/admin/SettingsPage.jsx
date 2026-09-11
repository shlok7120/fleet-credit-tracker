import { useEffect, useRef, useState } from 'react';
import {
  User, Building2, BellRing, Camera, Trash2, KeyRound, Send,
  CircleCheck, CircleAlert, Clock, Mail, Phone, ShieldCheck,
} from 'lucide-react';

import api, { errorMessage, USER_KEY } from '../../lib/api';
import { toAvatar, toLogo, dataUrlBytes } from '../../lib/image';
import { dateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Input, Label, Badge, PageLoader, Alert, Avatar, Switch, Tabs,
  FieldRow, EmptyState, Table, Th, Td, Tr,
} from '../../components/ui';

/**
 * Pump details are installation-wide configuration and stay admin-only; the
 * other two tabs are the signed-in person's own account, so every role gets
 * them. Non-admins never see the tab, and the API refuses it independently.
 */
const tabsFor = (role) => [
  { id: 'profile',       label: 'My profile',    icon: User },
  ...(role === 'admin'
    ? [{ id: 'pump',     label: 'Pump details',  icon: Building2 }]
    : []),
  { id: 'notifications', label: 'Notifications', icon: BellRing },
];

const EVENTS = [
  ['fraud_alert',   'Suspicious fill flagged',
   'The moment the anomaly model flags a fuelling, with the vehicle, amount and reason.'],
  ['credit_limit',  'Client near credit limit',
   'When a fleet passes 90% of its sanctioned limit, before a fill has to be refused.'],
  ['daily_summary', 'Daily summary',
   'One message at end of day with volume dispensed, revenue and any open alerts.'],
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const branding = useBranding();
  const isAdmin = user.role === 'admin';
  const TABS = tabsFor(user.role);

  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [log, setLog] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const avatarInput = useRef(null);
  const logoInput = useRef(null);

  /* ----------------------------------------------------------- loading -- */
  useEffect(() => {
    // A manager or attendant has no access to /settings, so do not ask for it —
    // requesting it anyway would surface a 403 on a page that is working fine.
    const requests = [api.get('/profile'), ...(isAdmin ? [api.get('/settings')] : [])];

    Promise.all(requests)
      .then(([p, s]) => {
        setProfile(p.data.profile);
        setDelivery(p.data.delivery);
        setSettings(isAdmin ? s.data : {});
      })
      .catch((e) => setError(errorMessage(e)));
  }, [isAdmin]);

  useEffect(() => {
    if (tab !== 'notifications' || log) return;
    api.get('/profile/notifications')
      .then(({ data }) => { setLog(data.notifications); setDelivery(data.delivery); })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, log]);

  const flash = (msg) => { setNotice(msg); setError(''); setTimeout(() => setNotice(''), 4000); };

  /* ------------------------------------------------------------ saving -- */
  const saveProfile = async (patch, successMessage = 'Profile saved.') => {
    setBusy(true); setError('');
    try {
      const { data } = await api.put('/profile', patch);
      setProfile(data.profile);

      // The sidebar reads name and avatar from the auth context, so it has to
      // learn about the change too — otherwise the header shows a stale name
      // until the next sign-in.
      const stored = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
      localStorage.setItem(USER_KEY, JSON.stringify({
        ...stored,
        full_name: data.profile.full_name,
        designation: data.profile.designation,
        avatar: data.profile.avatar,
        email: data.profile.email,
        phone: data.profile.phone,
      }));
      refreshUser?.();

      flash(successMessage);
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  const saveSettings = async (patch) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.put('/settings', patch);
      setSettings(data);
      branding.refresh();
      flash('Pump details saved.');
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  const onProfileSubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    saveProfile({
      full_name: f.get('full_name'),
      designation: f.get('designation'),
      email: f.get('email'),
      phone: f.get('phone'),
    });
  };

  const onPumpSubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    saveSettings({
      pump_name: f.get('pump_name'),
      oil_company: f.get('oil_company'),
      address: f.get('address'),
      city: f.get('city'),
      gstin: f.get('gstin'),
      contact_email: f.get('contact_email'),
      contact_phone: f.get('contact_phone'),
    });
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('new_password') !== f.get('confirm_password')) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api.put('/profile/password', {
        current_password: f.get('current_password'),
        new_password: f.get('new_password'),
      });
      e.target.reset();
      flash('Password updated.');
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const pickAvatar = async (file) => {
    if (!file) return;
    setError('');
    try {
      const dataUrl = await toAvatar(file);
      await saveProfile({ avatar: dataUrl },
        `Photo updated (${Math.round(dataUrlBytes(dataUrl) / 1024)} KB).`);
    } catch (err) { setError(err.message); }
  };

  const pickLogo = async (file) => {
    if (!file) return;
    setError('');
    try {
      const dataUrl = await toLogo(file);
      await saveSettings({ logo: dataUrl });
    } catch (err) { setError(err.message); }
  };

  const sendTest = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/profile/notifications/test');
      flash(data.message);
      const { data: fresh } = await api.get('/profile/notifications');
      setLog(fresh.notifications);
      setDelivery(fresh.delivery);
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  if (!profile || !settings) return <PageLoader label="Loading settings…" />;

  const events = profile.notify_events || {};
  const noProvider = delivery && !delivery.email.configured && !delivery.sms.configured;

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Settings' : 'My profile'}
        description={isAdmin
          ? "Your profile, this pump's details, and where alerts are sent."
          : 'Your details, and where your alerts are sent.'}
      />

      <div className="space-y-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {error && <Alert tone="red" title="That did not save">{error}</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}

        {/* ============================================== MY PROFILE ===== */}
        {tab === 'profile' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Your details</CardTitle>
                  <CardDescription>
                    This is the name that appears against transactions you review.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={onProfileSubmit} className="space-y-4">
                  <FieldRow>
                    <div>
                      <Label htmlFor="full_name">Full name</Label>
                      <Input id="full_name" name="full_name" required
                             defaultValue={profile.full_name} placeholder="F. M. Amin" />
                    </div>
                    <div>
                      <Label htmlFor="designation">Designation</Label>
                      <Input id="designation" name="designation"
                             defaultValue={profile.designation || ''} placeholder="Proprietor" />
                    </div>
                  </FieldRow>

                  <FieldRow>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                        <Input id="email" name="email" type="email" className="pl-10"
                               defaultValue={profile.email || ''} placeholder="owner@example.com" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                        <Input id="phone" name="phone" className="pl-10"
                               defaultValue={profile.phone || ''} placeholder="+91 98250 11223" />
                      </div>
                    </div>
                  </FieldRow>

                  <p className="text-[11.5px] leading-relaxed text-ink-3">
                    Alerts are delivered to the address and number above. Username
                    (<span className="font-mono">{profile.username}</span>) cannot be changed.
                  </p>

                  <div className="flex justify-end">
                    <Button type="submit" loading={busy}>Save changes</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-5">
              {/* ------------------------------- Photo ------------------- */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Photo</CardTitle>
                    <CardDescription>Shown beside your name in the sidebar.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <Avatar src={profile.avatar} name={profile.full_name} size="xl" />

                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }}
                  />

                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => avatarInput.current?.click()}>
                      <Camera className="size-3.5" /> {profile.avatar ? 'Replace' : 'Upload'}
                    </Button>
                    {profile.avatar && (
                      <Button variant="ghost" size="sm" onClick={() => saveProfile({ avatar: null }, 'Photo removed.')}>
                        <Trash2 className="size-3.5" /> Remove
                      </Button>
                    )}
                  </div>

                  <p className="text-center text-[11px] leading-relaxed text-ink-3">
                    Cropped square and resized to 256px in your browser, so only
                    a small image is ever uploaded.
                  </p>
                </CardContent>
              </Card>

              {/* ----------------------------- Password ------------------ */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="size-4 text-ink-3" /> Password
                    </CardTitle>
                    <CardDescription>Requires your current password.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onPasswordSubmit} className="space-y-3">
                    <Input name="current_password" type="password" required
                           placeholder="Current password" autoComplete="current-password" />
                    <Input name="new_password" type="password" required minLength={8}
                           placeholder="New password (min 8)" autoComplete="new-password" />
                    <Input name="confirm_password" type="password" required
                           placeholder="Confirm new password" autoComplete="new-password" />
                    <Button type="submit" variant="secondary" className="w-full" loading={busy}>
                      Update password
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ================================================ PUMP ========== */}
        {tab === 'pump' && isAdmin && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Pump details</CardTitle>
                  <CardDescription>
                    Used on the sign-in screen, in the sidebar, and on every invoice.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={onPumpSubmit} className="space-y-4">
                  <FieldRow>
                    <div>
                      <Label htmlFor="pump_name">Pump name</Label>
                      <Input id="pump_name" name="pump_name" required
                             defaultValue={settings.pump_name} placeholder="F.M. Amin & Co." />
                    </div>
                    <div>
                      <Label htmlFor="oil_company">Oil company</Label>
                      <Input id="oil_company" name="oil_company"
                             defaultValue={settings.oil_company || ''}
                             placeholder="Hindustan Petroleum" />
                    </div>
                  </FieldRow>

                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" name="address" defaultValue={settings.address || ''}
                           placeholder="Survey no., road, locality" />
                  </div>

                  <FieldRow>
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input id="city" name="city" defaultValue={settings.city || ''} />
                    </div>
                    <div>
                      <Label htmlFor="gstin">GSTIN</Label>
                      <Input id="gstin" name="gstin" defaultValue={settings.gstin || ''}
                             className="font-mono uppercase" placeholder="24AAAAA0000A1Z5" />
                    </div>
                  </FieldRow>

                  <FieldRow>
                    <div>
                      <Label htmlFor="contact_email">Contact email</Label>
                      <Input id="contact_email" name="contact_email" type="email"
                             defaultValue={settings.contact_email || ''} />
                    </div>
                    <div>
                      <Label htmlFor="contact_phone">Contact phone</Label>
                      <Input id="contact_phone" name="contact_phone"
                             defaultValue={settings.contact_phone || ''} />
                    </div>
                  </FieldRow>

                  <div className="flex justify-end">
                    <Button type="submit" loading={busy}>Save details</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Logo</CardTitle>
                  <CardDescription>Appears on invoices and the sign-in screen.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="glass-quiet grid h-28 w-full place-items-center p-3">
                  {settings.logo
                    ? <img src={settings.logo} alt="Pump logo" className="max-h-20 max-w-full object-contain" />
                    : <span className="text-[11.5px] text-ink-3">No logo uploaded</span>}
                </div>

                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }}
                />

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => logoInput.current?.click()}>
                    <Camera className="size-3.5" /> {settings.logo ? 'Replace' : 'Upload'}
                  </Button>
                  {settings.logo && (
                    <Button variant="ghost" size="sm" onClick={() => saveSettings({ logo: null })}>
                      <Trash2 className="size-3.5" /> Remove
                    </Button>
                  )}
                </div>

                <p className="text-center text-[11px] leading-relaxed text-ink-3">
                  PNG with a transparent background works best. SVG is kept as-is.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ======================================== NOTIFICATIONS ======== */}
        {tab === 'notifications' && (
          <div className="space-y-5">
            {noProvider && (
              <Alert tone="amber" title="No delivery provider is configured yet">
                Alerts are being recorded below but not actually sent. Add an email
                or SMS provider’s API key to the server’s environment to switch
                delivery on — nothing else needs to change.
              </Alert>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Where alerts go</CardTitle>
                    <CardDescription>Channels are used only if the matching detail is filled in.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <Switch
                    id="notify_email"
                    checked={profile.notify_email}
                    onChange={(v) => saveProfile({ notify_email: v }, 'Preference saved.')}
                    label="Email"
                    hint={profile.email
                      ? `Sent to ${profile.email}`
                      : 'Add an email address on the My profile tab first.'}
                    disabled={!profile.email}
                  />
                  <Switch
                    id="notify_sms"
                    checked={profile.notify_sms}
                    onChange={(v) => saveProfile({ notify_sms: v }, 'Preference saved.')}
                    label="SMS"
                    hint={profile.phone
                      ? `Sent to ${profile.phone}`
                      : 'Add a phone number on the My profile tab first.'}
                    disabled={!profile.phone}
                  />

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
                    <p className="text-[11.5px] leading-relaxed text-ink-3">
                      Sends a real message through whatever is configured.
                    </p>
                    <Button variant="secondary" size="sm" onClick={sendTest} loading={busy}>
                      <Send className="size-3.5" /> Send test
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>What to be told about</CardTitle>
                    <CardDescription>Applies to both channels.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {EVENTS.map(([key, label, hint]) => (
                    <Switch
                      key={key}
                      id={`ev_${key}`}
                      checked={Boolean(events[key])}
                      onChange={(v) =>
                        saveProfile({ notify_events: { ...events, [key]: v } }, 'Preference saved.')}
                      label={label}
                      hint={hint}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Delivery log</CardTitle>
                  <CardDescription>
                    Every message the system decided to send, whether or not it went out.
                  </CardDescription>
                </div>
                {delivery && (
                  <div className="flex gap-2">
                    <Badge tone={delivery.email.configured ? 'green' : 'slate'}>
                      <Mail className="size-3" />
                      {delivery.email.provider || 'email off'}
                    </Badge>
                    <Badge tone={delivery.sms.configured ? 'green' : 'slate'}>
                      <Phone className="size-3" />
                      {delivery.sms.provider || 'SMS off'}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {!log ? (
                  <PageLoader label="Loading delivery log…" />
                ) : log.length === 0 ? (
                  <EmptyState icon={ShieldCheck} title="Nothing sent yet"
                              hint="Alerts will appear here as they are triggered." />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>When</Th>
                        <Th>Event</Th>
                        <Th>Channel</Th>
                        <Th>To</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((n) => (
                        <Tr key={n.notification_id}>
                          <Td className="whitespace-nowrap text-ink-3">{dateTime(n.created_at)}</Td>
                          <Td className="font-medium text-ink">{n.event.replace(/_/g, ' ')}</Td>
                          <Td className="capitalize">{n.channel}</Td>
                          <Td className="text-ink-3">{n.recipient}</Td>
                          <Td>
                            <Badge tone={
                              n.status === 'sent' ? 'green'
                                : n.status === 'failed' ? 'red'
                                : n.status === 'skipped' ? 'amber' : 'slate'
                            }>
                              {n.status === 'sent' && <CircleCheck className="size-3" />}
                              {n.status === 'failed' && <CircleAlert className="size-3" />}
                              {n.status === 'queued' && <Clock className="size-3" />}
                              {n.status}
                            </Badge>
                            {n.error && (
                              <p className="mt-1 max-w-xs text-[11px] leading-snug text-ink-3">{n.error}</p>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
