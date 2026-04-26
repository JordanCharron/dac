import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { formatMoney } from '@/lib/format';

export function DashboardMetrics() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard-metrics', days],
    queryFn: () => apiGet<any>(`/api/admin/dashboard/metrics?days=${days}`),
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return null;

  const s = data.summary || {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-fg">{t('dashboard.period')}:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`btn ${days === d ? 'bg-accent text-accent-fg' : 'btn-ghost'} h-8 px-3`}
            onClick={() => setDays(d)}
          >
            {d}j
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label={t('dashboard.revenue')} value={formatMoney(s.revenue_period ?? 0, lang)} tone="accent" />
        <KPI label={t('dashboard.avgBasket')} value={formatMoney(s.avg_basket ?? 0, lang)} />
        <KPI label={t('dashboard.activeClients')} value={String(s.active_clients ?? 0)} />
        <KPI label={t('dashboard.awaitingAcceptance')} value={String(s.awaiting_acceptance ?? 0)} tone="warning" />
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-semibold">{t('dashboard.revenueByDay')}</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={data.revenueByDay}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B1C1C" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#8B1C1C" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${v} $`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: any) => formatMoney(Number(v), lang)}
              />
              <Area type="monotone" dataKey="revenue" stroke="#8B1C1C" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.topClients')}</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.topClients} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis type="number" fontSize={10} tickFormatter={(v) => `${Math.round(v)}$`} />
                <YAxis dataKey="company_name" type="category" fontSize={10} width={130} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(v: any) => formatMoney(Number(v), lang)}
                />
                <Bar dataKey="revenue" fill="#8B1C1C" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 font-semibold">{t('dashboard.topProducts')}</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.topProducts} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis type="number" fontSize={10} tickFormatter={(v) => `${Math.round(v)}$`} />
                <YAxis dataKey={lang === 'en' ? 'name_en' : 'name_fr'} type="category" fontSize={10} width={130} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(v: any) => formatMoney(Number(v), lang)}
                />
                <Bar dataKey="revenue" fill="#c0392b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'warning' }) {
  const toneClass =
    tone === 'accent' ? 'bg-accent/10 text-accent' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted';
  return (
    <div className="card p-4">
      <div className={`inline-block rounded px-2 py-0.5 text-xs ${toneClass}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
