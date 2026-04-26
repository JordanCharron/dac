import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function StockAdjustForm({ product, onDone }: { product: any; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState<'manual_loss' | 'manual_return' | 'manual_correction' | 'restock'>('restock');
  const [note, setNote] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [packedAt, setPackedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (delta === 0) return;
    setLoading(true);
    try {
      const body: any = { delta, reason, note };
      if (reason === 'restock') {
        if (lotNumber) body.lot_number = lotNumber;
        if (packedAt) body.packed_at = packedAt;
        if (expiresAt) body.expires_at = expiresAt;
      }
      await apiPost(`/api/admin/products/${product.id}/adjust-stock`, body);
      toast.push('success', t('common.success'));
      onDone();
    } catch {
      toast.push('error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  const isRestock = reason === 'restock';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-sm text-muted-fg">
        {product.name_fr} — {t('product.stockQty')}: <b>{product.stock_qty}</b> {product.unit}
      </div>
      <div>
        <label className="label">{t('product.reason')}</label>
        <select className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value as any)}>
          <option value="restock">{t('product.reasons.restock')}</option>
          <option value="manual_loss">{t('product.reasons.manual_loss')}</option>
          <option value="manual_return">{t('product.reasons.manual_return')}</option>
          <option value="manual_correction">{t('product.reasons.manual_correction')}</option>
        </select>
      </div>
      <div>
        <label className="label">
          {isRestock ? t('product.quantityReceived') : t('product.delta')}
        </label>
        <input
          className="input mt-1"
          type="number"
          step="0.01"
          value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}
          placeholder={isRestock ? 'ex: 50' : '+ ou −'}
        />
        <p className="mt-1 text-xs text-muted-fg">
          {isRestock ? t('product.restockHelp') : t('product.deltaHelp')}
        </p>
      </div>
      {isRestock && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <label className="label">{t('product.lotNumber')}</label>
            <input
              className="input mt-1"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="ex: L-2026-042"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('product.packedAt')}</label>
              <input
                className="input mt-1"
                type="date"
                value={packedAt}
                onChange={(e) => setPackedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t('product.expiresAt')}</label>
              <input
                className="input mt-1"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="label">{t('common.notes')}</label>
        <textarea className="input mt-1 h-16" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button disabled={loading} className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}
