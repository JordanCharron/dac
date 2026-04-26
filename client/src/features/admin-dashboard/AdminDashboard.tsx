import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Package, History } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { formatDate, formatMoney } from '@/lib/format';
import { DashboardMetrics } from './Metrics';

export function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [tab, setTab] = useState<'today' | 'trends'>('today');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiGet<any>('/api/admin/dashboard'),
    refetchInterval: 30_000,
  });
  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'today' ? 'border-accent text-fg' : 'border-transparent text-muted-fg hover:text-fg'}`}
          onClick={() => setTab('today')}
        >
          {t('dashboard.today')}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'trends' ? 'border-accent text-fg' : 'border-transparent text-muted-fg hover:text-fg'}`}
          onClick={() => setTab('trends')}
        >
          {t('dashboard.trends')}
        </button>
      </div>

      {tab === 'trends' ? <DashboardMetrics /> : (
      <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Clock className="h-5 w-5" />} label={t('dashboard.pendingOrders')} value={data.pendingCount} tone="accent" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label={t('dashboard.lowStock')} value={data.lowStock.length} tone="warning" />
        <StatCard icon={<Package className="h-5 w-5" />} label={t('dashboard.expiringSoon')} value={data.expiringSoon.length} tone="danger" />
        <StatCard icon={<History className="h-5 w-5" />} label={t('dashboard.recentMovements')} value={data.recentMovements.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.pendingOrders')}</h3>
          {data.pendingOrders.length === 0 ? (
            <p className="text-sm text-muted-fg">{t('dashboard.empty')}</p>
          ) : (
            <ul className="divide-y">
              {data.pendingOrders.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/admin/orders/${o.id}`} className="hover:underline">
                    <span className="font-medium">{o.order_number}</span>
                    <span className="ml-2 text-muted-fg">{o.company_name}</span>
                  </Link>
                  <span className="text-muted-fg">{formatMoney(o.total, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.lowStock')}</h3>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-muted-fg">{t('dashboard.empty')}</p>
          ) : (
            <ul className="divide-y">
              {data.lowStock.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{lang === 'en' ? p.name_en : p.name_fr}</span>
                  <span className="text-danger">
                    {p.stock_qty} / {p.low_stock_threshold} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.expiringSoon')}</h3>
          {data.expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-fg">{t('dashboard.empty')}</p>
          ) : (
            <ul className="divide-y">
              {data.expiringSoon.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{lang === 'en' ? p.name_en : p.name_fr}</span>
                  <span className="text-warning">{formatDate(p.expires_at, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.recentMovements')}</h3>
          {data.recentMovements.length === 0 ? (
            <p className="text-sm text-muted-fg">{t('dashboard.empty')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.recentMovements.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>{m.product_name}</span>
                  <span className={m.delta > 0 ? 'text-success' : 'text-danger'}>
                    {m.delta > 0 ? '+' : ''}
                    {m.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'accent' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent/10 text-accent'
      : tone === 'warning'
      ? 'bg-warning/10 text-warning'
      : tone === 'danger'
      ? 'bg-danger/10 text-danger'
      : 'bg-muted text-muted-fg';
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`rounded-lg p-2 ${toneClass}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-fg">{label}</div>
      </div>
    </div>
  );
}
