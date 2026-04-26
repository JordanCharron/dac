import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { ClipboardList, FileSpreadsheet } from 'lucide-react';
import { formatDate, formatMoney } from '@/lib/format';

export function AdminOrders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (q) qs.set('q', q);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

  const sageQs = new URLSearchParams();
  if (from) sageQs.set('from', from);
  if (to) sageQs.set('to', to);

  const orders = useQuery({
    queryKey: ['admin-orders', status, q, from, to],
    queryFn: () => apiGet<any[]>(`/api/admin/orders?${qs.toString()}`),
  });

  if (orders.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.orders')}</h1>
        <div className="flex gap-2">
          <a className="btn-outline" href={`/api/admin/orders/export.csv?${qs.toString()}`}>
            <Download className="h-4 w-4" />
            {t('order.exportCsv')}
          </a>
          <a
            className="btn-primary"
            href={`/api/admin/export/sage.imp?${sageQs.toString()}`}
            title={t('order.exportSageTitle')}
            onClick={() => {
              // After download, refresh the list so status changes to "Facturée" appear
              setTimeout(() => orders.refetch(), 1000);
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('order.exportSage')}
          </a>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label">{t('common.status')}</label>
          <select className="input mt-1 w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="submitted">{t('order.statuses.submitted')}</option>
            <option value="quoted">{t('order.statuses.quoted')}</option>
            <option value="accepted">{t('order.statuses.accepted')}</option>
            <option value="ready">{t('order.statuses.ready')}</option>
            <option value="delivered">{t('order.statuses.delivered')}</option>
            <option value="invoiced">{t('order.statuses.invoiced')}</option>
            <option value="cancelled">{t('order.statuses.cancelled')}</option>
          </select>
        </div>
        <div>
          <label className="label">{t('common.from')}</label>
          <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.to')}</label>
          <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
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
              <th className="px-3 py-2">{t('order.number')}</th>
              <th className="px-3 py-2">{t('order.client')}</th>
              <th className="px-3 py-2">{t('common.status')}</th>
              <th className="px-3 py-2">{t('order.submittedAt')}</th>
              <th className="px-3 py-2">{t('order.requestedDelivery')}</th>
              <th className="px-3 py-2">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4">
                  <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('empty.noOrders')} />
                </td>
              </tr>
            )}
            {orders.data?.map((o: any) => (
              <tr key={o.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link to={`/admin/orders/${o.id}`} className="hover:underline">{o.order_number}</Link>
                </td>
                <td className="px-3 py-2">{o.company_name}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.status} />
                </td>
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

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    submitted: 'bg-warning/15 text-warning',
    quoted: 'bg-warning/15 text-warning',
    accepted: 'bg-accent/15 text-accent',
    ready: 'bg-accent/25 text-accent',
    delivered: 'bg-success/15 text-success',
    invoiced: 'bg-success/25 text-success',
    cancelled: 'bg-muted text-muted-fg',
    draft: 'bg-muted text-muted-fg',
  };
  return <span className={`badge ${map[status] ?? 'bg-muted'}`}>{t(`order.statuses.${status}`)}</span>;
}
