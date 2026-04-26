import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Image as ImageIcon, PackageMinus } from 'lucide-react';
import { apiDelete, apiGet, api } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState } from '@/components/ui/empty';
import { formatQty } from '@/lib/format';
import { ProductForm } from './ProductForm';
import { StockAdjustForm } from './StockAdjustForm';

export function AdminProducts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<any | null>(null);

  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: () => apiGet('/api/admin/categories') });

  const products = useQuery({
    queryKey: ['admin-products', { q, categoryId, lowStockOnly }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (categoryId) p.set('category_id', categoryId);
      if (lowStockOnly) p.set('low_stock', '1');
      return apiGet<any[]>(`/api/admin/products?${p.toString()}`);
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
  });

  const filtered = useMemo(() => products.data ?? [], [products.data]);

  if (products.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('nav.inventory')}</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          {t('product.new')}
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div className="flex-1 min-w-60">
          <label className="label">{t('common.search')}</label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">{t('common.category')}</label>
          <select className="input mt-1 w-48" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {(categories.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'en' ? c.name_en : c.name_fr}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          {t('product.lowStock')}
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-3 py-2 w-14"></th>
              <th className="px-3 py-2">{t('common.code')}</th>
              <th className="px-3 py-2">{t('common.name')}</th>
              <th className="px-3 py-2">{t('common.category')}</th>
              <th className="px-3 py-2">{t('product.stockQty')}</th>
              <th className="px-3 py-2">{t('common.unit')}</th>
              <th className="px-3 py-2">{t('product.taxable')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4">
                  <EmptyState
                    icon={<ImageIcon className="h-6 w-6" />}
                    title={q || categoryId ? t('empty.noResults') : t('empty.noProducts')}
                    description={q || categoryId ? undefined : t('empty.noProductsHint')}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((p: any) => {
                const low = p.stock_qty <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      {p.image_path ? (
                        <img src={p.image_path} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-fg">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{lang === 'en' ? p.name_en : p.name_fr}</div>
                      {p.cut_grade && <div className="text-xs text-muted-fg">{p.cut_grade}</div>}
                    </td>
                    <td className="px-3 py-2 text-muted-fg">
                      {lang === 'en' ? p.category_name_en : p.category_name_fr}
                    </td>
                    <td className={`px-3 py-2 ${low ? 'text-danger font-medium' : ''}`}>
                      {formatQty(p.stock_qty, p.unit, lang)}
                      {low && <span className="ml-2 badge bg-danger/10 text-danger">{t('product.lowStock')}</span>}
                    </td>
                    <td className="px-3 py-2">{t(`units.${p.unit}`)}</td>
                    <td className="px-3 py-2">{p.taxable ? t('common.yes') : t('common.no')}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="btn-ghost p-1" onClick={() => setAdjusting(p)} title={t('product.adjustStock')}>
                        <PackageMinus className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost p-1" onClick={() => setEditing(p)} title={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-ghost p-1 text-danger"
                        onClick={async () => {
                          if (await confirm({ message: t('confirm.deactivateProduct', { name: lang === 'en' ? p.name_en : p.name_fr }), variant: 'danger', confirmLabel: t('common.delete') })) del.mutate(p.id);
                        }}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('product.new') : t('product.edit')}
        wide
      >
        {editing && (
          <ProductForm
            product={editing === 'new' ? null : editing}
            categories={(categories.data as any[]) ?? []}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['admin-products'] });
            }}
          />
        )}
      </Dialog>

      <Dialog open={!!adjusting} onClose={() => setAdjusting(null)} title={t('product.adjustStock')}>
        {adjusting && (
          <StockAdjustForm
            product={adjusting}
            onDone={() => {
              setAdjusting(null);
              qc.invalidateQueries({ queryKey: ['admin-products'] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
