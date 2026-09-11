import { useEffect, useState } from 'react';
import {
  UserPlus, KeyRound, Pencil, UserX, UserCheck, Users, ShieldCheck,
  Briefcase, Gauge, TriangleAlert,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { dateOnly } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Tr, Button, Input, Label, Select,
  Badge, PageLoader, Alert, EmptyState, Avatar, Modal, FieldRow,
} from '../../components/ui';

const ROLE_META = {
  admin:     { label: 'Pump admin',   tone: 'brand',  icon: ShieldCheck },
  manager:   { label: 'Fleet manager', tone: 'violet', icon: Briefcase },
  attendant: { label: 'Attendant',    tone: 'green',  icon: Gauge },
};

export default function UsersPage() {
  const { user: me } = useAuth();

  const [users, setUsers] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [newRole, setNewRole] = useState('attendant');

  const load = () =>
    api.get('/users').then(({ data }) => setUsers(data)).catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    load();
    api.get('/clients').then(({ data }) => setClients(data)).catch(() => {});
  }, []);

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 5000); };

  const addUser = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      const body = {
        username: f.get('username'),
        password: f.get('password'),
        full_name: f.get('full_name'),
        role: f.get('role'),
        designation: f.get('designation'),
        email: f.get('email'),
        phone: f.get('phone'),
      };
      if (f.get('role') === 'manager' && f.get('client_id')) {
        body.client_id = Number(f.get('client_id'));
      }
      await api.post('/users', body);
      setAdding(false);
      flash(`${body.full_name} can now sign in as “${body.username}”.`);
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      await api.patch(`/users/${editing.user_id}`, {
        full_name: f.get('full_name'),
        designation: f.get('designation'),
        email: f.get('email'),
        phone: f.get('phone'),
        role: f.get('role'),
      });
      setEditing(null);
      flash('Account updated.');
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const doReset = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('new_password') !== f.get('confirm')) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/users/${resetting.user_id}/password`, {
        new_password: f.get('new_password'),
      });
      setResetting(null);
      flash(data.message);
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const setActive = async (u, active) => {
    setBusy(true); setError('');
    try {
      if (active) {
        await api.patch(`/users/${u.user_id}`, { is_active: true });
        flash(`${u.full_name} can sign in again.`);
      } else {
        const { data } = await api.delete(`/users/${u.user_id}`);
        flash(data.orphaned_clients?.length
          ? `${data.message} ${data.orphaned_clients.join(', ')} now has no manager.`
          : data.message);
      }
      setRemoving(null);
      load();
    } catch (err) { setError(errorMessage(err)); setRemoving(null); }
    setBusy(false);
  };

  if (!users) return <PageLoader label="Loading staff accounts…" />;

  const active = users.filter((u) => u.is_active);

  return (
    <div>
      <PageHeader
        title="Staff accounts"
        description="Who can sign in, and what they are allowed to see."
        actions={
          <Button size="sm" onClick={() => { setNewRole('attendant'); setAdding(true); }}>
            <UserPlus className="size-4" /> Add person
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}

        <Card>
          <CardContent className="p-0">
            {users.length === 0 ? (
              <EmptyState icon={Users} title="No accounts yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Username</Th>
                    <Th>Role</Th>
                    <Th>Fleet</Th>
                    <Th>Contact</Th>
                    <Th className="text-right">Fills logged</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const meta = ROLE_META[u.role] ?? ROLE_META.attendant;
                    const isMe = u.user_id === me.user_id;
                    return (
                      <Tr key={u.user_id} className={u.is_active ? '' : 'opacity-55'}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <Avatar src={u.avatar} name={u.full_name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">
                                {u.full_name}
                                {isMe && <span className="ml-1.5 text-[11px] text-ink-3">(you)</span>}
                              </p>
                              <p className="truncate text-[11px] text-ink-3">
                                {u.designation || `Added ${dateOnly(u.created_at)}`}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td className="font-mono text-[12.5px]">{u.username}</Td>
                        <Td>
                          <Badge tone={meta.tone}>
                            <meta.icon className="size-3" /> {meta.label}
                          </Badge>
                          {!u.is_active && <Badge tone="slate" className="ml-1.5">removed</Badge>}
                        </Td>
                        <Td className="text-ink-3">{u.company_name || '—'}</Td>
                        <Td className="text-[12px] text-ink-3">
                          {u.email || '—'}
                          {u.phone && <span className="block">{u.phone}</span>}
                        </Td>
                        <Td className="tnum text-right">{u.txn_count}</Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" title="Edit details"
                                    onClick={() => setEditing(u)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Reset password"
                                    onClick={() => setResetting(u)}>
                              <KeyRound className="size-3.5" />
                            </Button>
                            {u.is_active ? (
                              <Button
                                variant="ghost" size="sm" title={isMe ? 'You cannot remove yourself' : 'Remove access'}
                                disabled={isMe}
                                onClick={() => setRemoving(u)}
                              >
                                <UserX className="size-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" title="Restore access"
                                      onClick={() => setActive(u, true)}>
                                <UserCheck className="size-3.5 text-emerald-600" />
                              </Button>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="px-1 text-[11.5px] leading-relaxed text-ink-3">
          Removing someone blocks their sign-in but keeps every transaction they
          logged — {active.length} of {users.length} accounts are currently active.
        </p>
      </div>

      {/* ----------------------------- Add person ------------------------- */}
      {adding && (
        <Modal
          title="Add a person"
          description="They will be able to sign in immediately with the username and password you set."
          size="lg"
          onClose={() => setAdding(false)}
        >
          <form onSubmit={addUser} className="space-y-4">
            <FieldRow>
              <div>
                <Label>Full name</Label>
                <Input name="full_name" required placeholder="Ramesh Solanki" />
              </div>
              <div>
                <Label>Role</Label>
                <Select name="role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="attendant">Pump attendant</option>
                  <option value="manager">Fleet manager</option>
                  <option value="admin">Pump admin</option>
                </Select>
              </div>
            </FieldRow>

            <FieldRow>
              <div>
                <Label>Username</Label>
                <Input name="username" required placeholder="ramesh" className="font-mono lowercase" />
                <p className="mt-1 text-[11px] text-ink-3">Lowercase letters, numbers, underscore.</p>
              </div>
              <div>
                <Label>Password</Label>
                <Input name="password" type="password" required minLength={8}
                       placeholder="At least 8 characters" autoComplete="new-password" />
                <p className="mt-1 text-[11px] text-ink-3">Share it with them; they can change it later.</p>
              </div>
            </FieldRow>

            {newRole === 'manager' && (
              <div>
                <Label>Fleet they manage</Label>
                <Select name="client_id" defaultValue="">
                  <option value="">— assign later —</option>
                  {clients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-ink-3">
                  A manager sees nothing until a fleet is assigned to them.
                </p>
              </div>
            )}

            <FieldRow>
              <div>
                <Label>Email <span className="font-normal text-ink-3">optional</span></Label>
                <Input name="email" type="email" placeholder="name@example.com" />
              </div>
              <div>
                <Label>Phone <span className="font-normal text-ink-3">optional</span></Label>
                <Input name="phone" placeholder="+91 98250 11223" />
              </div>
            </FieldRow>

            <div>
              <Label>Designation <span className="font-normal text-ink-3">optional</span></Label>
              <Input name="designation" placeholder="Forecourt attendant" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Create account</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------------- Edit ----------------------------- */}
      {editing && (
        <Modal
          title={`Edit ${editing.full_name}`}
          description={`Signs in as ${editing.username}`}
          size="lg"
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveEdit} className="space-y-4">
            <FieldRow>
              <div>
                <Label>Full name</Label>
                <Input name="full_name" required defaultValue={editing.full_name} />
              </div>
              <div>
                <Label>Designation</Label>
                <Input name="designation" defaultValue={editing.designation || ''} />
              </div>
            </FieldRow>
            <FieldRow>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={editing.email || ''} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input name="phone" defaultValue={editing.phone || ''} />
              </div>
            </FieldRow>
            <div>
              <Label>Role</Label>
              <Select name="role" defaultValue={editing.role}
                      disabled={editing.user_id === me.user_id}>
                <option value="attendant">Pump attendant</option>
                <option value="manager">Fleet manager</option>
                <option value="admin">Pump admin</option>
              </Select>
              {editing.user_id === me.user_id && (
                <p className="mt-1 text-[11px] text-ink-3">You cannot change your own role.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* --------------------------- Reset password ----------------------- */}
      {resetting && (
        <Modal
          title={`Reset password — ${resetting.full_name}`}
          description="You do not need their old password. Tell them the new one."
          onClose={() => setResetting(null)}
        >
          <form onSubmit={doReset} className="space-y-3.5">
            <div>
              <Label>New password</Label>
              <Input name="new_password" type="password" required minLength={8}
                     autoFocus autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div>
              <Label>Confirm</Label>
              <Input name="confirm" type="password" required autoComplete="new-password" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setResetting(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Reset password</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------------ Remove ---------------------------- */}
      {removing && (
        <Modal title={`Remove ${removing.full_name}?`} onClose={() => setRemoving(null)}>
          <Alert tone="amber" className="mb-4">
            <span className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                They will no longer be able to sign in. The {removing.txn_count} transaction
                {removing.txn_count === 1 ? '' : 's'} they logged stay in the ledger, and you can
                restore their access at any time.
                {removing.company_name && (
                  <> <strong>{removing.company_name}</strong> will be left without a manager.</>
                )}
              </span>
            </span>
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => setActive(removing, false)}>
              <UserX className="size-4" /> Remove access
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
