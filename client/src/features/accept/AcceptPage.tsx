import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, FileDown } from 'lucide-react';
import { api, apiGet } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm';
import { FleurDeLys } from '@/components/layout/Logo';
import { formatDate, formatMoney } from '@/lib/format';

export function AcceptPage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const confirm = useConfirm();
  const [action, setAction] = useState<'idle' | 'accepted' | 'declined' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accept', token],
    queryFn: () => apiGet<any>(`/api/public/accept/${token}`),
    retry: false,
  });

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/public/accept/${token}`, { method: 'POST', json: {} });
      setAction('accepted');
      refetch();
    } catch (err: any) {
      if (err?.body?.error === 'insufficient_stock') setError(t('order.insufficientStock'));
      else setError(t('common.error'));
      setAction('error');
    } finally {
      setLoading(false);
    }
  }

  async function decline() {
    if (!(await confirm({ message: t('accept.confirmDecline'), variant: 'danger', confirmLabel: t('accept.decline') }))) return;
    setLoading(true);
    try {
      await api(`/api/public/accept/${token}/decline`, { method: 'POST', json: {} });
      setAction('declined');
      refetch();
    } catch {
      setError(t('common.error'));
      setAction('error');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><PageSpinner /></div>;
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="card max-w-md p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-4 text-xl font-semibold">{t('accept.invalidLink')}</h1>
          <p className="mt-2 text-muted-fg">{t('accept.invalidLinkHelp')}</p>
        </div>
      </div>
    );
  }

  const alreadyAccepted = data.status === 'accepted' || action === 'accepted';
  const declined = data.status === 'cancelled' || action === 'declined';
  const canAct = data.status === 'quoted' && action === 'idle';

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <div className="flex flex-col items-center gap-2 pb-4">
          <FleurDeLys className="h-12 w-12 text-accent" />
          <h1 className="text-xl font-semibold">{t('app.title')}</h1>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-fg">{t('order.number')}</div>
              <div className="text-2xl font-bold text-accent">{data.order_number}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-fg">{t('common.total')}</div>
              <div className="text-2xl font-bold">{formatMoney(data.total, lang)}</div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-fg">{t('order.client')}</div>
              <div className="font-medium">{data.company_name}</div>
              {data.contact_name && <div className="text-muted-fg">{data.contact_name}</div>}
            </div>
            <div>
              <div className="text-xs text-muted-fg">{t('order.fulfillmentMethod')}</div>
              <div className="font-medium">
                {data.fulfillment_method === 'pickup' ? t('order.pickup') : t('order.delivery')}
              </div>
            </div>
            {data.requested_delivery_date && (
              <div>
                <div className="text-xs text-muted-fg">
                  {data.fulfillment_method === 'pickup' ? t('order.requestedPickup') : t('order.requestedDelivery')}
                </div>
                <div className="font-medium">{formatDate(data.requested_delivery_date, lang)}</div>
              </div>
            )}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-fg">
                <tr>
                  <th className="px-3 py-2">{t('common.name')}</th>
                  <th className="px-3 py-2">{t('common.unit')}</th>
                  <th className="px-3 py-2">{t('common.quantity')}</th>
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
                    <td className="px-3 py-2">{formatMoney(it.unit_price_snapshot, lang)}</td>
                    <td className="px-3 py-2">{formatMoney(it.line_total, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end gap-4 border-t pt-4 text-sm">
            <div className="flex flex-col items-end gap-1">
              <div className="flex w-48 justify-between"><span>{t('common.subtotal')}</span><span>{formatMoney(data.subtotal, lang)}</span></div>
              <div className="flex w-48 justify-between"><span>{t('common.gst')}</span><span>{formatMoney(data.gst, lang)}</span></div>
              <div className="flex w-48 justify-between"><span>{t('common.qst')}</span><span>{formatMoney(data.qst, lang)}</span></div>
              <div className="flex w-48 justify-between border-t pt-1 font-semibold text-base"><span>{t('common.total')}</span><span>{formatMoney(data.total, lang)}</span></div>
            </div>
          </div>
        </div>

        {alreadyAccepted && (
          <div className="card flex items-center gap-3 border-success/40 bg-success/10 p-4">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div className="text-sm">
              <div className="font-semibold">{t('accept.accepted')}</div>
              <div className="text-muted-fg">{t('accept.acceptedHelp')}</div>
            </div>
          </div>
        )}

        {declined && (
          <div className="card flex items-center gap-3 border-danger/40 bg-danger/10 p-4">
            <XCircle className="h-6 w-6 text-danger" />
            <div className="text-sm">
              <div className="font-semibold">{t('accept.declined')}</div>
            </div>
          </div>
        )}

        {error && <div className="card border-danger/40 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        {canAct && (
          <div className="card p-4">
            <p className="mb-4 text-sm">{t('accept.prompt')}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={accept} disabled={loading}>
                <CheckCircle2 className="h-4 w-4" />
                {t('accept.accept')}
              </button>
              <button className="btn-outline text-danger" onClick={decline} disabled={loading}>
                <XCircle className="h-4 w-4" />
                {t('accept.decline')}
              </button>
              <a
                className="btn-outline ml-auto"
                href={`/api/public/accept/${token}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <FileDown className="h-4 w-4" />
                {t('order.downloadQuote')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
