import { useEffect, useState } from 'react';
import { Truck, Plus, X } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, litres, num, dateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Button, Input, Label, Select,
  Badge, PageLoader, Alert, EmptyState,
} from '../../components/ui';

export default function VehiclesPage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState(null);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get('/vehicles').then(({ data }) => setVehicles(data)).catch((e) => setError(errorMessage(e)));

  useEffect(() => { load(); }, []);

  const addVehicle = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      await api.post('/vehicles', {
        client_id: user.client_id,
        license_plate: f.get('license_plate'),
        make_model: f.get('make_model'),
        fuel: f.get('fuel'),
        tank_capacity: Number(f.get('tank_capacity')),
      });
      setShowAdd(false);
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  if (!vehicles) return <PageLoader label="Loading vehicles…" />;

  return (
    <div>
      <PageHeader
        title="Fleet vehicles"
        description={`${vehicles.length} vehicles registered for credit fuelling`}
        actions={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="size-4" /> Add vehicle</Button>}
      />

      <div className="space-y-4 p-6">
        {error && <Alert tone="red">{error}</Alert>}

        <Card>
          <CardContent className="p-0">
            {vehicles.length === 0 ? (
              <EmptyState icon={Truck} title="No vehicles registered"
                          hint="Add a vehicle so attendants can log fuel against it." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Plate</Th>
                    <Th>Make / model</Th>
                    <Th>Fuel</Th>
                    <Th className="text-right">Tank</Th>
                    <Th className="text-right">Fills</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Spend</Th>
                    <Th>Last fuelled</Th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.vehicle_id} className="transition-colors hover:bg-slate-50">
                      <Td className="font-mono font-semibold text-slate-900">{v.license_plate}</Td>
                      <Td className="text-slate-600">{v.make_model || '—'}</Td>
                      <Td><Badge tone={v.fuel === 'diesel' ? 'amber' : v.fuel === 'cng' ? 'green' : 'brand'}>
                        {v.fuel}
                      </Badge></Td>
                      <Td className="text-right tnum text-slate-500">{v.tank_capacity} L</Td>
                      <Td className="text-right tnum">{num(v.txn_count)}</Td>
                      <Td className="text-right tnum">{litres(v.total_liters)}</Td>
                      <Td className="text-right tnum font-medium">{money(v.total_spend)}</Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {v.last_fuelled ? dateTime(v.last_fuelled) : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
             onClick={() => setShowAdd(false)}>
          <Card className="w-full max-w-md animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-900">Add vehicle</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </div>
            <CardContent className="pt-5">
              <form onSubmit={addVehicle} className="space-y-3.5">
                <div>
                  <Label>Licence plate</Label>
                  <Input name="license_plate" required placeholder="MH12AB1234" className="font-mono uppercase" />
                </div>
                <div>
                  <Label>Make / model</Label>
                  <Input name="make_model" placeholder="Tata Prima 4928.S" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fuel type</Label>
                    <Select name="fuel" defaultValue="diesel">
                      <option value="diesel">Diesel</option>
                      <option value="petrol">Petrol</option>
                      <option value="cng">CNG</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Tank capacity (L)</Label>
                    <Input name="tank_capacity" type="number" min="1" step="0.5" required placeholder="380" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" loading={busy}>Add vehicle</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
