import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function ProductForm({
  product,
  categories,
  onDone,
}: {
  product: any | null;
  categories: any[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const isNew = !product;
  const [form, setForm] = useState({
    code: product?.code ?? '',
    category_id: product?.category_id ?? '',
    name_fr: product?.name_fr ?? '',
    name_en: product?.name_en ?? '',
    description_fr: product?.description_fr ?? '',
    description_en: product?.description_en ?? '',
    unit: product?.unit ?? 'kg',
    low_stock_threshold: product?.low_stock_threshold ?? 0,
    cut_grade: product?.cut_grade ?? '',
    variable_weight: !!product?.variable_weight,
    taxable: product?.taxable != null ? !!product.taxable : false,
    supplier: product?.supplier ?? '',
    active: product?.active != null ? !!product.active : true,
  });
  const [file, setFile] = useState<File | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) {
        if (v === '' || v == null) continue;
        fd.append(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
      }
      if (file) fd.append('image', file);
      if (product) {
        await api(`/api/admin/products/${product.id}`, { method: 'PATCH', form: fd });
      } else {
        await api('/api/admin/products', { method: 'POST', form: fd });
      }
      toast.push('success', t('common.success'));
      onDone();
    } catch (err: any) {
      toast.push('error', err?.body?.error ?? t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">{t('product.code')}</label>
          <input className="input mt-1" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('product.category')}</label>
          <select
            className="input mt-1"
            value={form.category_id || ''}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_fr} / {c.name_en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('product.nameFr')}</label>
          <input className="input mt-1" required value={form.name_fr} onChange={(e) => setForm({ ...form, name_fr: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('product.nameEn')}</label>
          <input className="input mt-1" required value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('product.descriptionFr')}</label>
          <textarea className="input mt-1 h-20" value={form.description_fr} onChange={(e) => setForm({ ...form, description_fr: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t('product.descriptionEn')}</label>
          <textarea className="input mt-1 h-20" value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('product.unit')}</label>
          <select className="input mt-1" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as any })}>
            <option value="kg">kg</option>
            <option value="caisse">caisse / case</option>
            <option value="unite">unité / unit</option>
          </select>
        </div>
        <div>
          <label className="label">{t('product.cutGrade')}</label>
          <input className="input mt-1" value={form.cut_grade} onChange={(e) => setForm({ ...form, cut_grade: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('product.lowStockThreshold')}</label>
          <input className="input mt-1" type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">{t('product.supplier')}</label>
          <input className="input mt-1" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </div>
        {isNew && (
          <div className="sm:col-span-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-fg">
            {t('product.stockHint')}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.variable_weight} onChange={(e) => setForm({ ...form, variable_weight: e.target.checked })} />
          {t('product.variableWeight')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} />
          {t('product.taxable')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          {t('product.active')}
        </label>
        <div className="sm:col-span-2">
          <label className="label">{t('product.image')}</label>
          <input className="input mt-1" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {product?.image_path && !file && <img src={product.image_path} alt="" className="mt-2 h-20 w-20 rounded object-cover" />}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button disabled={loading} className="btn-primary">{t('common.save')}</button>
      </div>
    </form>
  );
}
