import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Edit3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { PageSpinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm';

type PriceList = { id: number; name: string; is_default: number };

export function AdminPriceLists() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<PriceList> | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-price-lists'],
    queryFn: () => apiGet<PriceList[]>('/api/admin/price-lists'),
  });

  const save = useMutation({
    mutationFn: (pl: Partial<PriceList>) =>
      pl.id
        ? apiPatch(`/api/admin/price-lists/${pl.id}`, { name: pl.name, is_default: !!pl.is_default })
        : apiPost('/api/admin/price-lists', { name: pl.name, is_default: !!pl.is_default }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-price-lists'] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/price-lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-price-lists'] }),
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.priceLists')}</h1>
        <button className="btn-primary" onClick={() => setEditing({ is_default: 0 })}>
          <Plus className="h-4 w-4" />
          {t('priceList.new')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-4 py-2">{t('priceList.name')}</th>
              <th className="px-4 py-2">{t('priceList.isDefault')}</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((pl) => (
              <tr key={pl.id} className="border-t">
                <td className="px-4 py-2 font-medium">{pl.name}</td>
                <td className="px-4 py-2">{pl.is_default ? t('common.yes') : t('common.no')}</td>
                <td className="px-4 py-2 text-right">
                  <Link className="btn-ghost p-1" to={`/admin/price-lists/${pl.id}`} title={t('priceList.editPrices')}>
                    <Edit3 className="h-4 w-4" />
                  </Link>
                  <button className="btn-ghost p-1" onClick={() => setEditing(pl)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost p-1 text-danger"
                    onClick={async () => {
                      if (await confirm({ message: t('confirm.deletePriceList', { name: pl.name }), variant: 'danger', confirmLabel: t('common.delete') })) del.mutate(pl.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('priceList.edit') : t('priceList.new')}>
        {editing && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
            <div>
              <label className="label">{t('priceList.name')}</label>
              <input className="input mt-1" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked ? 1 : 0 })} />
              {t('priceList.isDefault')}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={save.isPending}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
