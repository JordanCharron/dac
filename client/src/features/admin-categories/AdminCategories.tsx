import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';

type Category = { id: number; name_fr: string; name_en: string; sort_order: number };

export function AdminCategories() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => apiGet<Category[]>('/api/admin/categories'),
  });

  const save = useMutation({
    mutationFn: async (c: Partial<Category>) => {
      if (c.id) return apiPatch(`/api/admin/categories/${c.id}`, c);
      return apiPost('/api/admin/categories', c);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      setEditing(null);
      toast.push('success', t('common.success'));
    },
    onError: () => toast.push('error', t('common.error')),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.categories')}</h1>
        <button className="btn-primary" onClick={() => setEditing({ sort_order: 0 })}>
          <Plus className="h-4 w-4" />
          {t('category.new')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-fg">
            <tr>
              <th className="px-4 py-2">{t('category.nameFr')}</th>
              <th className="px-4 py-2">{t('category.nameEn')}</th>
              <th className="px-4 py-2">{t('category.sortOrder')}</th>
              <th className="px-4 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">{c.name_fr}</td>
                <td className="px-4 py-2">{c.name_en}</td>
                <td className="px-4 py-2">{c.sort_order}</td>
                <td className="px-4 py-2 text-right">
                  <button className="btn-ghost p-1" onClick={() => setEditing(c)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost p-1 text-danger"
                    onClick={async () => {
                      if (await confirm({ message: t('confirm.deleteCategory', { name: c.name_fr }), variant: 'danger', confirmLabel: t('common.delete') })) del.mutate(c.id);
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

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('category.edit') : t('category.new')}>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({
                ...editing,
                sort_order: Number(editing.sort_order ?? 0),
              });
            }}
          >
            <div>
              <label className="label">{t('category.nameFr')}</label>
              <input
                className="input mt-1"
                value={editing.name_fr ?? ''}
                onChange={(e) => setEditing({ ...editing, name_fr: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">{t('category.nameEn')}</label>
              <input
                className="input mt-1"
                value={editing.name_en ?? ''}
                onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">{t('category.sortOrder')}</label>
              <input
                className="input mt-1"
                type="number"
                value={editing.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" disabled={save.isPending}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
