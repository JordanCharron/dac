import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { History } from 'lucide-react';
import { formatDate } from '@/lib/format';

export function AdminAudit() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');

  const qs = new URLSearchParams();
  if (entity) qs.set('entity', entity);
  if (q) qs.set('q', q);

  const log = useQuery({
    queryKey: ['admin-audit', entity, q],
    queryFn: () => apiGet<any[]>(`/api/admin/audit?${qs.toString()}`),
  });

  if (log.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('audit.title')}</h1>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">{t('audit.entity')}</label>
          <select className="input mt-1 w-40" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="product">{t('audit.entities.product')}</option>
            <option value="client">{t('audit.entities.client')}</option>
            <option value="order">{t('audit.entities.order')}</option>
            <option value="price_list_prices">{t('audit.entities.prices')}</option>
          </select>
        </div>
        <div className="flex-1 min-w-60">
          <label className="label">{t('common.search')}</label>
          <input className="input mt-1" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-3 py-2">{t('audit.when')}</th>
              <th className="px-3 py-2">{t('audit.user')}</th>
              <th className="px-3 py-2">{t('audit.action')}</th>
              <th className="px-3 py-2">{t('audit.entity')}</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">{t('audit.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4">
                  <EmptyState icon={<History className="h-6 w-6" />} title={t('empty.noResults')} />
                </td>
              </tr>
            )}
            {log.data?.map((r: any) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-fg">{formatDate(r.created_at, lang)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.username ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="badge bg-muted text-fg">{r.action}</span>
                </td>
                <td className="px-3 py-2">{r.entity}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.entity_id ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-fg max-w-md">
                  {r.diff ? (
                    <pre className="whitespace-pre-wrap break-words">{r.diff}</pre>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
