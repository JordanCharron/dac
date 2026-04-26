import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Play } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useBasePath } from '@/lib/useBasePath';
import { formatDate } from '@/lib/format';
import { FileText } from 'lucide-react';

export function ClientTemplates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const basePath = useBasePath();

  const templates = useQuery({ queryKey: ['templates'], queryFn: () => apiGet<any[]>('/api/templates') });

  const apply = useMutation({
    mutationFn: (id: number) => apiPost(`/api/templates/${id}/apply`),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.push('success', t('templates.appliedCount', { count: r.applied }));
      navigate(`${basePath}/cart`);
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  if (templates.isLoading) return <PageSpinner />;
  const rows = templates.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('templates.title')}</h1>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={t('templates.empty')}
          description={t('templates.emptyHelp')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t2: any) => (
            <div key={t2.id} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{t2.name}</div>
                  <div className="text-xs text-muted-fg">{t2.items.length} items · {t(`order.${t2.fulfillment_method}`)}</div>
                  <div className="text-xs text-muted-fg mt-1">{formatDate(t2.created_at, lang)}</div>
                </div>
                <button
                  className="btn-ghost p-1 text-danger"
                  onClick={async () => { if (await confirm({ message: t('templates.confirmDelete', { name: t2.name }), variant: 'danger', confirmLabel: t('common.delete') })) del.mutate(t2.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <button className="btn-primary mt-auto" onClick={() => apply.mutate(t2.id)} disabled={apply.isPending}>
                <Play className="h-4 w-4" />
                {t('templates.use')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
