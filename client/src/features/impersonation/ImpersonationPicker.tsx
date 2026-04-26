import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useImpersonation } from './ImpersonationContext';

export function ImpersonationPicker() {
  const { t } = useTranslation();
  const { setActing } = useImpersonation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const clients = useQuery({
    queryKey: ['admin-clients-for-impersonation'],
    queryFn: () => apiGet<any[]>('/api/admin/clients'),
  });

  if (clients.isLoading) return <PageSpinner />;

  const list = (clients.data ?? []).filter(
    (c: any) => c.user_active && c.company_name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('impersonate.pickClient')}</h1>
      <p className="text-sm text-muted-fg">{t('impersonate.pickHelp')}</p>

      <div className="card p-3">
        <input
          className="input max-w-sm"
          placeholder={t('common.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c: any) => (
          <button
            key={c.id}
            className="card flex flex-col items-start gap-2 p-4 text-left transition hover:border-accent"
            onClick={() => {
              setActing({ id: c.id, company_name: c.company_name });
              navigate('/admin/as/catalog');
            }}
          >
            <div className="font-semibold">{c.company_name}</div>
            <div className="text-xs text-muted-fg">
              {c.username} · {c.pricing_mode === 'quote' ? t('client.pricingModes.quote') : c.price_list_name ?? t('common.none')}
            </div>
            {c.min_order_amount != null && (
              <div className="text-xs text-muted-fg">
                {t('client.minOrder')}: {c.min_order_amount}
              </div>
            )}
          </button>
        ))}
        {list.length === 0 && <p className="col-span-full py-8 text-center text-muted-fg">{t('common.none')}</p>}
      </div>
    </div>
  );
}
