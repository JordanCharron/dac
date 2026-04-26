import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { ShoppingCart as CartIcon } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { useBasePath } from '@/lib/useBasePath';

export function ClientCart() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const basePath = useBasePath();
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');

  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => apiGet<any>('/api/products') });
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => apiGet<any>('/api/cart') });

  const updateQty = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      apiPatch(`/api/cart/items/${id}`, { quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });
  const removeItem = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/cart/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  const submitM = useMutation({
    mutationFn: () =>
      apiPost('/api/cart/submit', {
        requested_delivery_date: deliveryDate || undefined,
        fulfillment_method: fulfillment,
        notes: notes || undefined,
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries();
      toast.push('success', `${t('common.success')} — ${data.order_number}`);
      navigate(`${basePath || ''}/orders/${data.order_id}`);
    },
    onError: (err: any) => {
      const e = err?.body?.error;
      if (e === 'empty_cart') toast.push('error', t('order.cartEmpty'));
      else if (e === 'insufficient_stock') toast.push('error', t('order.insufficientStock'));
      else if (e === 'min_order_not_met') toast.push('error', t('order.minOrderWarn', { amount: formatMoney(err.body.minimum, lang) }));
      else toast.push('error', t('common.error'));
    },
  });

  if (cart.isLoading) return <PageSpinner />;

  const items = cart.data?.items ?? [];
  const order = cart.data?.order ?? { subtotal: 0, gst: 0, qst: 0, total: 0 };
  const client = (catalog.data as any)?.client;
  const quoteMode = client?.quote_mode;
  const minOrder = client?.min_order_amount;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('nav.cart')}</h1>

      {items.length === 0 ? (
        <EmptyState icon={<CartIcon className="h-6 w-6" />} title={t('order.cartEmpty')} />
      ) : (
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2">
                      {it.product_name_snapshot}
                      {it.variable_weight_snapshot ? (
                        <span className="ml-2 badge bg-warning/15 text-warning">Var.</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{t(`units.${it.unit_snapshot}`)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="input h-8 w-24"
                        value={it.quantity_requested}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0) updateQty.mutate({ id: it.id, quantity: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{quoteMode ? t('product.onDemand') : formatMoney(it.unit_price_snapshot, lang)}</td>
                    <td className="px-3 py-2">{quoteMode ? '—' : formatMoney(it.line_total, lang)}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn-ghost p-1 text-danger" onClick={() => removeItem.mutate(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4 space-y-3 text-sm">
            {!quoteMode && (
              <>
                <div className="flex justify-between"><span>{t('common.subtotal')}</span><span>{formatMoney(order.subtotal, lang)}</span></div>
                <div className="flex justify-between"><span>{t('common.gst')}</span><span>{formatMoney(order.gst, lang)}</span></div>
                <div className="flex justify-between"><span>{t('common.qst')}</span><span>{formatMoney(order.qst, lang)}</span></div>
                <div className="flex justify-between font-semibold text-base pt-1"><span>{t('common.total')}</span><span>{formatMoney(order.total, lang)}</span></div>
                {fulfillment === 'delivery' && minOrder != null && order.subtotal < minOrder && (
                  <p className="text-sm text-warning">{t('order.minOrderWarn', { amount: formatMoney(minOrder, lang) })}</p>
                )}
                {fulfillment === 'pickup' && minOrder != null && (
                  <p className="text-xs text-muted-fg">{t('order.minOrderPickupNote')}</p>
                )}
              </>
            )}
            <hr />
            <div>
              <label className="label mb-2 block">{t('order.fulfillmentMethod')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    fulfillment === 'delivery'
                      ? 'border-accent bg-accent/10 text-fg'
                      : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => setFulfillment('delivery')}
                >
                  <div className="font-semibold">{t('order.delivery')}</div>
                  <div className="text-xs text-muted-fg">{t('order.deliveryDesc')}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    fulfillment === 'pickup'
                      ? 'border-accent bg-accent/10 text-fg'
                      : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => setFulfillment('pickup')}
                >
                  <div className="font-semibold">{t('order.pickup')}</div>
                  <div className="text-xs text-muted-fg">{t('order.pickupDesc')}</div>
                </button>
              </div>
            </div>
            <div>
              <label className="label">
                {fulfillment === 'pickup' ? t('order.requestedPickup') : t('order.requestedDelivery')}
              </label>
              <input type="date" className="input mt-1" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('common.notes')}</label>
              <textarea className="input mt-1 h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => submitM.mutate()}
              disabled={
                submitM.isPending ||
                (fulfillment === 'delivery' && !quoteMode && minOrder != null && order.subtotal < minOrder)
              }
            >
              {t('order.confirmSubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
