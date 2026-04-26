import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw, FileText } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { PageSpinner } from '@/components/ui/spinner';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/features/admin-orders/AdminOrders';
import { useBasePath } from '@/lib/useBasePath';

export function ClientOrderDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const basePath = useBasePath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['client-order', id],
    queryFn: () => apiGet<any>(`/api/orders/${id}`),
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const saveTemplate = useMutation({
    mutationFn: () =>
      apiPost('/api/templates', {
        name: templateName,
        from_order_id: Number(id),
        fulfillment_method: (data as any)?.fulfillment_method ?? 'delivery',
      }),
    onSuccess: () => {
      toast.push('success', t('templates.saved'));
      setSaveOpen(false);
      setTemplateName('');
    },
    onError: () => toast.push('error', t('common.error')),
  });

  const reorder = useMutation({
    mutationFn: () => apiPost(`/api/orders/${id}/reorder`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.push('success', t('order.reordered'));
      navigate(`${basePath}/cart`);
    },
    onError: (err: any) => {
      if (err?.body?.error === 'no_available_items') toast.push('error', t('order.reorderEmpty'));
      else toast.push('error', t('common.error'));
    },
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`${basePath}/orders`} className="btn-ghost p-1"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-xl font-semibold">{data.order_number}</h1>
        <StatusBadge status={data.status} />
        <div className="ml-auto flex gap-2">
          <button className="btn-outline" onClick={() => setSaveOpen(true)}>
            <FileText className="h-4 w-4" />
            {t('templates.saveAs')}
          </button>
          <button className="btn-outline" onClick={() => reorder.mutate()} disabled={reorder.isPending}>
            <RotateCcw className="h-4 w-4" />
            {t('order.reorder')}
          </button>
        </div>
      </div>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title={t('templates.saveAs')}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (templateName.trim()) saveTemplate.mutate(); }}
          className="space-y-3"
        >
          <div>
            <label className="label">{t('templates.name')}</label>
            <input
              className="input mt-1"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={data?.order_number ?? ''}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={saveTemplate.isPending}>{t('common.save')}</button>
          </div>
        </form>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-fg">
              <tr>
                <th className="px-3 py-2">{t('common.name')}</th>
                <th className="px-3 py-2">{t('common.unit')}</th>
                <th className="px-3 py-2">{t('order.quantityRequested')}</th>
                <th className="px-3 py-2">{t('order.quantityConfirmed')}</th>
                <th className="px-3 py-2">{t('common.price')}</th>
                <th className="px-3 py-2">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it: any) => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">{it.product_name_snapshot}</td>
                  <td className="px-3 py-2">{t(`units.${it.unit_snapshot}`)}</td>
                  <td className="px-3 py-2">{it.quantity_requested}</td>
                  <td className="px-3 py-2">{it.quantity_confirmed ?? '—'}</td>
                  <td className="px-3 py-2">{formatMoney(it.unit_price_snapshot, lang)}</td>
                  <td className="px-3 py-2">{formatMoney(it.line_total, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>{t('order.submittedAt')}</span><span>{formatDate(data.submitted_at, lang)}</span></div>
          {data.confirmed_at && <div className="flex justify-between"><span>{t('order.confirmedAt')}</span><span>{formatDate(data.confirmed_at, lang)}</span></div>}
          {data.delivered_at && <div className="flex justify-between"><span>{t('order.deliveredAt')}</span><span>{formatDate(data.delivered_at, lang)}</span></div>}
          {data.requested_delivery_date && <div className="flex justify-between"><span>{t('order.requestedDelivery')}</span><span>{formatDate(data.requested_delivery_date, lang)}</span></div>}
          <hr className="my-2" />
          <div className="flex justify-between"><span>{t('common.subtotal')}</span><span>{formatMoney(data.subtotal, lang)}</span></div>
          <div className="flex justify-between"><span>{t('common.gst')}</span><span>{formatMoney(data.gst, lang)}</span></div>
          <div className="flex justify-between"><span>{t('common.qst')}</span><span>{formatMoney(data.qst, lang)}</span></div>
          <div className="flex justify-between font-semibold text-base pt-1"><span>{t('common.total')}</span><span>{formatMoney(data.total, lang)}</span></div>
          {data.notes && <><hr className="my-2" /><div className="text-xs whitespace-pre-line text-muted-fg">{data.notes}</div></>}
        </div>
      </div>
    </div>
  );
}
