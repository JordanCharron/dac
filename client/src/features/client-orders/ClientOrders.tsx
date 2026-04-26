import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { ClipboardList } from 'lucide-react';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/features/admin-orders/AdminOrders';
import { useBasePath } from '@/lib/useBasePath';

export function ClientOrders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const basePath = useBasePath();
  const { data, isLoading } = useQuery({
    queryKey: ['client-orders'],
    queryFn: () => apiGet<any[]>('/api/orders'),
  });
  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('nav.myOrders')}</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-3 py-2">{t('order.number')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2">{t('order.submittedAt')}</th>
              <th className="px-3 py-2">{t('order.requestedDelivery')}</th>
              <th className="px-3 py-2">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4">
                  <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('empty.noOrders')} />
                </td>
              </tr>
            )}
            {data?.map((o) => (
              <tr key={o.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link to={`${basePath}/orders/${o.id}`} className="hover:underline">{o.order_number}</Link>
                </td>
                <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-2">{formatDate(o.submitted_at, lang)}</td>
                <td className="px-3 py-2">{formatDate(o.requested_delivery_date, lang)}</td>
                <td className="px-3 py-2">{formatMoney(o.total, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
