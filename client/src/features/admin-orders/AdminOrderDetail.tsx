import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, CheckCircle2, Truck, XCircle, FileDown, Mail, Pencil, PackageCheck } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from './AdminOrders';

type Item = {
  id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  taxable_snapshot: number;
  variable_weight_snapshot: number;
  quantity_requested: number;
  quantity_confirmed: number | null;
  unit_price_snapshot: number | null;
  line_total: number;
};

export function AdminOrderDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => apiGet<any>(`/api/admin/orders/${id}`),
  });

  const [edits, setEdits] = useState<Record<number, { quantity_requested?: number; unit_price_snapshot?: number | null }>>({});

  useEffect(() => {
    if (data?.items) setEdits({});
  }, [data?.items]);

  const patchItem = useMutation({
    mutationFn: async (args: { itemId: number; body: any }) =>
      apiPatch(`/api/admin/orders/${id}/items/${args.itemId}`, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-order', id] }),
  });

  const sendQuote = useMutation({
    mutationFn: () => apiPost(`/api/admin/orders/${id}/send-quote`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.push('success', t('order.quoteSent'));
    },
    onError: (err: any) => {
      if (err?.body?.error === 'no_client_email') toast.push('error', t('order.noClientEmail'));
      else toast.push('error', t('common.error'));
    },
  });
  const markReadyM = useMutation({
    mutationFn: () => apiPost(`/api/admin/orders/${id}/mark-ready`),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.push('success', r.notified ? t('order.readyNotified') : t('order.ready'));
    },
  });
  const deliverM = useMutation({
    mutationFn: () => apiPost(`/api/admin/orders/${id}/deliver`, { send_invoice: true }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.push('success', r.invoice_sent ? t('order.deliveredInvoiceSent') : t('order.delivered'));
    },
  });
  const sendInvoiceM = useMutation({
    mutationFn: () => apiPost(`/api/admin/orders/${id}/send-invoice`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.push('success', t('order.invoiceSent'));
    },
    onError: () => toast.push('error', t('common.error')),
  });
  const cancelM = useMutation({
    mutationFn: () => apiPost(`/api/admin/orders/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.push('success', t('order.cancelled'));
    },
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return null;

  const canEditPrices = data.status === 'submitted' || data.status === 'quoted';
  const canSendQuote = canEditPrices;
  const canMarkReady = data.status === 'accepted';
  const canDeliver = data.status === 'accepted' || data.status === 'ready';
  const canSendInvoice = data.status === 'delivered' || data.status === 'accepted' || data.status === 'ready';
  const canCancel = data.status !== 'cancelled' && data.status !== 'delivered';

  function applyEdit(item: Item) {
    const e = edits[item.id];
    if (!e) return;
    const body: any = {};
    if (e.quantity_requested != null && e.quantity_requested !== item.quantity_requested) {
      body.quantity_requested = e.quantity_requested;
    }
    if (e.unit_price_snapshot !== undefined && e.unit_price_snapshot !== item.unit_price_snapshot) {
      body.unit_price_snapshot = e.unit_price_snapshot;
    }
    if (Object.keys(body).length) patchItem.mutate({ itemId: item.id, body });
    setEdits((s) => {
      const n = { ...s };
      delete n[item.id];
      return n;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/orders" className="btn-ghost p-1"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-xl font-semibold">{data.order_number ?? `#${data.id}`}</h1>
        <StatusBadge status={data.status} />
        <span className="badge bg-muted text-muted-fg">
          {data.fulfillment_method === 'pickup' ? t('order.pickup') : t('order.delivery')}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <a className="btn-outline" href={`/api/admin/orders/${id}/pdf?variant=bon`} target="_blank" rel="noreferrer">
            <FileDown className="h-4 w-4" /> {t('order.downloadQuote')}
          </a>
          {data.status !== 'draft' && data.status !== 'submitted' && (
            <a className="btn-outline" href={`/api/admin/orders/${id}/pdf?variant=facture`} target="_blank" rel="noreferrer">
              <FileDown className="h-4 w-4" /> {t('order.downloadInvoice')}
            </a>
          )}
          {canSendQuote && (
            <button className="btn-primary" onClick={() => sendQuote.mutate()} disabled={sendQuote.isPending}>
              <Send className="h-4 w-4" />
              {data.status === 'quoted' ? t('order.resendQuote') : t('order.sendQuote')}
            </button>
          )}
          {canMarkReady && (
            <button className="btn-outline" onClick={() => markReadyM.mutate()} disabled={markReadyM.isPending}>
              <PackageCheck className="h-4 w-4" />
              {t('order.markReady')}
            </button>
          )}
          {canDeliver && (
            <button className="btn-primary" onClick={() => deliverM.mutate()} disabled={deliverM.isPending}>
              <Truck className="h-4 w-4" />
              {data.fulfillment_method === 'pickup' ? t('order.markPickedUp') : t('order.markDelivered')}
            </button>
          )}
          {canSendInvoice && (
            <button className="btn-outline" onClick={() => sendInvoiceM.mutate()} disabled={sendInvoiceM.isPending}>
              <Mail className="h-4 w-4" />
              {data.invoice_sent_at ? t('order.resendInvoice') : t('order.sendInvoice')}
            </button>
          )}
          {canCancel && (
            <button
              className="btn-outline text-danger"
              onClick={async () => {
                if (await confirm({ message: t('confirm.cancelOrder', { number: data.order_number ?? '?' }), variant: 'danger', confirmLabel: t('order.cancel') })) cancelM.mutate();
              }}
            >
              <XCircle className="h-4 w-4" /> {t('order.cancel')}
            </button>
          )}
        </div>
      </div>

      {data.status === 'quoted' && (
        <div className="card border-warning/40 bg-warning/10 p-3 text-sm">
          <span className="font-medium text-warning">⏳ {t('order.awaitingAcceptance')}</span>
          {data.quote_sent_at && <span className="ml-2 text-muted-fg">({formatDate(data.quote_sent_at, lang)})</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-x-auto">
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
              {data.items.map((it: Item) => {
                const edit = edits[it.id] ?? {};
                const hasEdits =
                  (edit.quantity_requested != null && edit.quantity_requested !== it.quantity_requested) ||
                  (edit.unit_price_snapshot !== undefined && edit.unit_price_snapshot !== it.unit_price_snapshot);
                return (
                  <tr key={it.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {it.product_name_snapshot}
                      {!it.taxable_snapshot && (
                        <span className="ml-2 badge bg-muted text-muted-fg">{t('product.nonTaxable')}</span>
                      )}
                      {!!it.variable_weight_snapshot && (
                        <span className="ml-2 badge bg-warning/15 text-warning">{t('product.variable')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{t(`units.${it.unit_snapshot}`)}</td>
                    <td className="px-3 py-2">
                      {canEditPrices ? (
                        <input
                          type="number"
                          step="0.01"
                          className="input h-8 w-24"
                          value={edit.quantity_requested ?? it.quantity_requested}
                          onChange={(e) =>
                            setEdits((s) => ({
                              ...s,
                              [it.id]: { ...s[it.id], quantity_requested: Number(e.target.value) },
                            }))
                          }
                        />
                      ) : (
                        it.quantity_confirmed ?? it.quantity_requested
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEditPrices ? (
                        <input
                          type="number"
                          step="0.01"
                          className="input h-8 w-28"
                          placeholder={t('product.onDemand')}
                          value={
                            edit.unit_price_snapshot !== undefined
                              ? edit.unit_price_snapshot ?? ''
                              : it.unit_price_snapshot ?? ''
                          }
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], unit_price_snapshot: v } }));
                          }}
                        />
                      ) : (
                        formatMoney(it.unit_price_snapshot, lang)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {formatMoney(it.line_total, lang)}
                      {hasEdits && (
                        <button
                          className="btn-primary ml-2 h-7 px-2 text-xs"
                          onClick={() => applyEdit(it)}
                          disabled={patchItem.isPending}
                        >
                          <Pencil className="h-3 w-3" />
                          {t('common.save')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card p-4 space-y-2 text-sm">
          <h3 className="font-semibold">{t('order.client')}</h3>
          <div>{data.company_name}</div>
          {data.contact_name && <div className="text-muted-fg">{data.contact_name}</div>}
          {data.phone && <div className="text-muted-fg">{data.phone}</div>}
          {data.email && <div className="text-muted-fg">{data.email}</div>}
          {data.delivery_address && <div className="text-muted-fg whitespace-pre-line">{data.delivery_address}</div>}
          <hr className="my-2" />
          {data.submitted_at && <div className="flex justify-between"><span>{t('order.submittedAt')}</span><span>{formatDate(data.submitted_at, lang)}</span></div>}
          {data.quote_sent_at && <div className="flex justify-between"><span>{t('order.quoteSentAt')}</span><span>{formatDate(data.quote_sent_at, lang)}</span></div>}
          {data.accepted_at && <div className="flex justify-between"><span>{t('order.acceptedAt')}</span><span>{formatDate(data.accepted_at, lang)}</span></div>}
          {data.delivered_at && <div className="flex justify-between"><span>{t('order.deliveredAt')}</span><span>{formatDate(data.delivered_at, lang)}</span></div>}
          {data.invoice_sent_at && <div className="flex justify-between"><span>{t('order.invoiceSentAt')}</span><span>{formatDate(data.invoice_sent_at, lang)}</span></div>}
          {data.requested_delivery_date && (
            <div className="flex justify-between">
              <span>{data.fulfillment_method === 'pickup' ? t('order.requestedPickup') : t('order.requestedDelivery')}</span>
              <span>{formatDate(data.requested_delivery_date, lang)}</span>
            </div>
          )}
          <hr className="my-2" />
          <div className="flex justify-between"><span>{t('common.subtotal')}</span><span>{formatMoney(data.subtotal, lang)}</span></div>
          <div className="flex justify-between"><span>{t('common.gst')}</span><span>{formatMoney(data.gst, lang)}</span></div>
          <div className="flex justify-between"><span>{t('common.qst')}</span><span>{formatMoney(data.qst, lang)}</span></div>
          <div className="flex justify-between font-semibold text-base pt-1"><span>{t('common.total')}</span><span>{formatMoney(data.total, lang)}</span></div>
          {data.notes && (
            <>
              <hr className="my-2" />
              <div className="text-xs whitespace-pre-line text-muted-fg">{data.notes}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
