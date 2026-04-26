import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calculator } from 'lucide-react';
import { api, apiGet, apiPut } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';

type Row = { product_id: number; code: string; name_fr: string; name_en: string; unit: string; price: number | null };

export function AdminPriceListEdit() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useParams();
  const toast = useToast();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-price-list', id],
    queryFn: () => apiGet<Row[]>(`/api/admin/price-lists/${id}/prices`),
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  useEffect(() => { if (data) setRows(data); }, [data]);

  async function save() {
    setSaving(true);
    try {
      await apiPut(`/api/admin/price-lists/${id}/prices`, {
        prices: rows.map((r) => ({ product_id: r.product_id, price: r.price })),
      });
      toast.push('success', t('common.success'));
      refetch();
    } catch {
      toast.push('error', t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/price-lists" className="btn-ghost p-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">{t('priceList.editPrices')}</h1>
        <button className="btn-outline ml-auto" onClick={() => setBulkOpen(true)}>
          <Calculator className="h-4 w-4" />
          {t('priceList.bulkEdit')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-3 py-2">{t('common.code')}</th>
              <th className="px-3 py-2">{t('common.name')}</th>
              <th className="px-3 py-2">{t('common.unit')}</th>
              <th className="px-3 py-2 w-40">{t('priceList.price')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.product_id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{lang === 'en' ? r.name_en : r.name_fr}</td>
                <td className="px-3 py-2">{t(`units.${r.unit}`)}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    className="input h-8"
                    value={r.price ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      const next = [...rows];
                      next[i] = { ...r, price: v };
                      setRows(next);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {t('priceList.savePrices')}
        </button>
      </div>

      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} title={t('priceList.bulkEdit')}>
        <BulkEditForm
          priceListId={Number(id)}
          onDone={() => { setBulkOpen(false); refetch(); }}
        />
      </Dialog>
    </div>
  );
}

function BulkEditForm({ priceListId, onDone }: { priceListId: number; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [operation, setOperation] = useState<'percent' | 'delta' | 'set' | 'copy_from'>('percent');
  const [value, setValue] = useState<number>(0);
  const [sourceId, setSourceId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const lists = useQuery({ queryKey: ['admin-price-lists'], queryFn: () => apiGet<any[]>('/api/admin/price-lists') });
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: () => apiGet<any[]>('/api/admin/categories') });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: any = { operation };
      if (operation !== 'copy_from') body.value = value;
      if (operation === 'copy_from' && sourceId) body.source_price_list_id = Number(sourceId);
      if (categoryId) body.category_id = Number(categoryId);
      const res = await api<{ updated: number }>(`/api/admin/price-lists/${priceListId}/bulk-update`, {
        method: 'POST',
        json: body,
      });
      toast.push('success', t('priceList.bulkDone', { count: res.updated }));
      onDone();
    } catch {
      toast.push('error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">{t('priceList.operation')}</label>
        <select className="input mt-1" value={operation} onChange={(e) => setOperation(e.target.value as any)}>
          <option value="percent">{t('priceList.op.percent')}</option>
          <option value="delta">{t('priceList.op.delta')}</option>
          <option value="set">{t('priceList.op.set')}</option>
          <option value="copy_from">{t('priceList.op.copy_from')}</option>
        </select>
      </div>
      {operation === 'copy_from' ? (
        <div>
          <label className="label">{t('priceList.sourceList')}</label>
          <select className="input mt-1" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
            <option value="">—</option>
            {(lists.data ?? []).filter((l) => l.id !== priceListId).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">
            {operation === 'percent' ? t('priceList.op.percentHelp') : operation === 'delta' ? t('priceList.op.deltaHelp') : t('priceList.op.setHelp')}
          </label>
          <input type="number" step="0.01" className="input mt-1" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </div>
      )}
      <div>
        <label className="label">{t('priceList.restrictCategory')}</label>
        <select className="input mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('priceList.allProducts')}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name_fr}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={loading}>{t('common.save')}</button>
      </div>
    </form>
  );
}
