import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiPost } from '@/lib/api';
import { useAuth } from './AuthContext';
import { FleurDeLys } from '@/components/layout/Logo';

export function LoginPage() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost('/api/auth/login', { username, password });
      refresh();
    } catch {
      setError(t('auth.invalid'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex flex-col items-center gap-2 pb-2">
          <FleurDeLys className="h-12 w-12 text-accent" />
          <h1 className="text-lg font-semibold text-center">{t('app.title')}</h1>
          <p className="text-xs text-muted-fg text-center">{t('app.tagline')}</p>
        </div>
        <div>
          <label className="label">{t('auth.username')}</label>
          <input
            className="input mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label">{t('auth.password')}</label>
          <input
            className="input mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={loading} className="btn-primary w-full">
          {t('auth.signIn')}
        </button>
      </form>
    </div>
  );
}
