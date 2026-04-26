import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiPost } from '@/lib/api';
import { useAuth } from './AuthContext';

export function ChangePasswordPage({ mandatory }: { mandatory?: boolean }) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError(t('auth.passwordsMismatch'));
    setLoading(true);
    try {
      await apiPost('/api/auth/change-password', { current_password: current, new_password: next });
      refresh();
    } catch (err: any) {
      setError(err?.body?.error === 'invalid_credentials' ? t('auth.invalid') : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex ${mandatory ? 'min-h-screen' : ''} items-center justify-center bg-muted/30 p-4`}>
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
        <h1 className="text-lg font-semibold">{t('auth.changePassword')}</h1>
        {mandatory && <p className="text-sm text-warning">{t('auth.mustChange')}</p>}
        <div>
          <label className="label">{t('auth.currentPassword')}</label>
          <input className="input mt-1" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('auth.newPassword')}</label>
          <input className="input mt-1" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('auth.confirmNewPassword')}</label>
          <input className="input mt-1" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={loading} className="btn-primary w-full">
          {t('common.save')}
        </button>
      </form>
    </div>
  );
}
