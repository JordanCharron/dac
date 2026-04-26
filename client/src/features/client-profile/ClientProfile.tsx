import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Lock } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';

export function ClientProfile() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<any>('/api/profile'),
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data) setForm({
    contact_name: data.contact_name ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    delivery_address: data.delivery_address ?? '',
    notes: data.notes ?? '',
  }); }, [data]);

  const save = useMutation({
    mutationFn: () => apiPatch('/api/profile', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.push('success', t('common.success')); },
    onError: () => toast.push('error', t('common.error')),
  });

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirmP, setConfirmP] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  async function changePwd(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    if (next !== confirmP) { setPwdError(t('auth.passwordsMismatch')); return; }
    setPwdLoading(true);
    try {
      await apiPost('/api/auth/change-password', { current_password: cur, new_password: next });
      setCur(''); setNext(''); setConfirmP('');
      toast.push('success', t('common.success'));
    } catch (err: any) {
      setPwdError(err?.body?.error === 'invalid_credentials' ? t('auth.invalid') : t('common.error'));
    } finally {
      setPwdLoading(false);
    }
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">{t('profile.title')}</h1>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <User className="h-5 w-5 text-accent" />
          <h2 className="font-semibold">{t('profile.contact')}</h2>
        </div>
        <div className="text-sm text-muted-fg">
          {t('profile.company')}: <b className="text-fg">{data.company_name}</b> · {t('auth.username')}: <code>{data.username}</code>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('client.contactName')}</label>
            <input className="input mt-1" value={form.contact_name ?? ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('client.phone')}</label>
            <input className="input mt-1" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('client.email')}</label>
            <input className="input mt-1" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <p className="mt-1 text-xs text-muted-fg">{t('profile.emailHelp')}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t('client.deliveryAddress')}</label>
            <textarea className="input mt-1 h-20" value={form.delivery_address ?? ''} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {t('common.save')}
          </button>
        </div>
      </div>

      <form onSubmit={changePwd} className="card p-5 space-y-3">
        <div className="flex items-center gap-2 border-b pb-3">
          <Lock className="h-5 w-5 text-accent" />
          <h2 className="font-semibold">{t('auth.changePassword')}</h2>
        </div>
        <div>
          <label className="label">{t('auth.currentPassword')}</label>
          <input className="input mt-1" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('auth.newPassword')}</label>
            <input className="input mt-1" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          </div>
          <div>
            <label className="label">{t('auth.confirmNewPassword')}</label>
            <input className="input mt-1" type="password" value={confirmP} onChange={(e) => setConfirmP(e.target.value)} required />
          </div>
        </div>
        {pwdError && <p className="text-sm text-danger">{pwdError}</p>}
        <div className="flex justify-end">
          <button className="btn-primary" disabled={pwdLoading}>{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
