import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Key, Power } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';

export function AdminClients() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [resetting, setResetting] = useState<any | null>(null);

  const clients = useQuery({
    queryKey: ['admin-clients', q],
    queryFn: () => apiGet<any[]>(`/api/admin/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });
  const priceLists = useQuery({
    queryKey: ['admin-price-lists'],
    queryFn: () => apiGet<any[]>('/api/admin/price-lists'),
  });

  const toggle = useMutation({
    mutationFn: (c: any) => apiPatch(`/api/admin/clients/${c.id}`, { user_active: !c.user_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-clients'] }),
  });

  if (clients.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.clients')}</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          {t('client.new')}
        </button>
      </div>

      <div className="card p-3">
        <input
          className="input max-w-sm"
          placeholder={t('common.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-3 py-2">{t('client.companyName')}</th>
              <th className="px-3 py-2">{t('auth.username')}</th>
              <th className="px-3 py-2">{t('client.pricingMode')}</th>
              <th className="px-3 py-2">{t('client.priceList')}</th>
              <th className="px-3 py-2">{t('client.minOrder')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {clients.data?.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-medium">{c.company_name}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.username}</td>
                <td className="px-3 py-2">{t(`client.pricingModes.${c.pricing_mode}`)}</td>
                <td className="px-3 py-2">{c.price_list_name ?? t('common.none')}</td>
                <td className="px-3 py-2">{c.min_order_amount ?? t('common.none')}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${c.user_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-fg'}`}>
                    {c.user_active ? t('client.active') : t('client.inactive')}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-ghost p-1" title={t('client.resetPassword')} onClick={() => setResetting(c)}>
                    <Key className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost p-1" onClick={() => setEditing(c)} title={t('common.edit')}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost p-1"
                    title={c.user_active ? t('client.inactive') : t('client.active')}
                    onClick={() => toggle.mutate(c)}
                  >
                    <Power className={`h-4 w-4 ${c.user_active ? '' : 'text-muted-fg'}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('client.new') : t('client.edit')}
        wide
      >
        {editing && (
          <ClientForm
            client={editing === 'new' ? null : editing}
            priceLists={(priceLists.data as any[]) ?? []}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['admin-clients'] });
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!resetting} onClose={() => setResetting(null)} title={t('client.resetPassword')}>
        {resetting && (
          <ResetPasswordForm
            client={resetting}
            onDone={() => {
              setResetting(null);
              toast.push('success', t('common.success'));
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ClientForm({ client, priceLists, onDone }: { client: any | null; priceLists: any[]; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: client?.username ?? '',
    password: '',
    company_name: client?.company_name ?? '',
    contact_name: client?.contact_name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    delivery_address: client?.delivery_address ?? '',
    notes: client?.notes ?? '',
    pricing_mode: client?.pricing_mode ?? 'price_list',
    price_list_id: client?.price_list_id ?? '',
    min_order_amount: client?.min_order_amount ?? '',
    gst_number: client?.gst_number ?? '',
    qst_number: client?.qst_number ?? '',
    tax_exempt: client?.tax_exempt ? true : false,
    exempt_reason: client?.exempt_reason ?? '',
    payment_terms_days: client?.payment_terms_days ?? 30,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        delivery_address: form.delivery_address || null,
        notes: form.notes || null,
        pricing_mode: form.pricing_mode,
        price_list_id: form.price_list_id ? Number(form.price_list_id) : null,
        min_order_amount: form.min_order_amount === '' ? null : Number(form.min_order_amount),
        gst_number: form.gst_number || null,
        qst_number: form.qst_number || null,
        tax_exempt: !!form.tax_exempt,
        exempt_reason: form.exempt_reason || null,
        payment_terms_days: Number(form.payment_terms_days) || 30,
      };
      if (!client) {
        payload.username = form.username;
        payload.password = form.password;
        await apiPost('/api/admin/clients', payload);
      } else {
        await apiPatch(`/api/admin/clients/${client.id}`, payload);
      }
      toast.push('success', t('common.success'));
      onDone();
    } catch (err: any) {
      if (err?.body?.error === 'username_taken') toast.push('error', t('client.usernameTaken'));
      else toast.push('error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {!client && (
          <>
            <div>
              <label className="label">{t('auth.username')}</label>
              <input className="input mt-1" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('client.tempPassword')}</label>
              <input className="input mt-1" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label className="label">{t('client.companyName')}</label>
          <input className="input mt-1" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.contactName')}</label>
          <input className="input mt-1" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.phone')}</label>
          <input className="input mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.email')}</label>
          <input className="input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('client.deliveryAddress')}</label>
          <textarea className="input mt-1 h-20" value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.pricingMode')}</label>
          <select className="input mt-1" value={form.pricing_mode} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
            <option value="price_list">{t('client.pricingModes.price_list')}</option>
            <option value="quote">{t('client.pricingModes.quote')}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('client.priceList')}</label>
          <select
            className="input mt-1"
            value={form.price_list_id}
            onChange={(e) => setForm({ ...form, price_list_id: e.target.value })}
            disabled={form.pricing_mode === 'quote'}
          >
            <option value="">—</option>
            {priceLists.map((pl) => (
              <option key={pl.id} value={pl.id}>{pl.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('client.minOrder')}</label>
          <input
            className="input mt-1"
            type="number"
            step="0.01"
            value={form.min_order_amount}
            onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
          />
        </div>
        <div>
          <label className="label">{t('client.gstNumber')}</label>
          <input className="input mt-1" value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.qstNumber')}</label>
          <input className="input mt-1" value={form.qst_number} onChange={(e) => setForm({ ...form, qst_number: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('client.paymentTerms')}</label>
          <input className="input mt-1" type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })} />
        </div>
        <label className="flex items-center gap-2 text-sm pt-6">
          <input type="checkbox" checked={form.tax_exempt} onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })} />
          {t('client.taxExempt')}
        </label>
        {form.tax_exempt && (
          <div className="sm:col-span-2">
            <label className="label">{t('client.exemptReason')}</label>
            <input className="input mt-1" value={form.exempt_reason} onChange={(e) => setForm({ ...form, exempt_reason: e.target.value })} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">{t('client.notes')}</label>
          <textarea className="input mt-1 h-16" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button disabled={loading} className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ client, onDone }: { client: any; onDone: () => void }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost(`/api/admin/clients/${client.id}/reset-password`, { password: pwd });
      onDone();
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">{t('client.tempPassword')}</label>
        <input className="input mt-1" required minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button disabled={loading} className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}
