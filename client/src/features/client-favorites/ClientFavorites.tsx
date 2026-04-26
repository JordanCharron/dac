import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Star, Image as ImageIcon, ShoppingCart } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { useBasePath } from '@/lib/useBasePath';

export function ClientFavorites() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const toast = useToast();
  const basePath = useBasePath();

  const favs = useQuery({ queryKey: ['favorites'], queryFn: () => apiGet<any[]>('/api/favorites') });
  const remove = useMutation({
    mutationFn: (pid: number) => apiDelete(`/api/favorites/${pid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
  const addToCart = useMutation({
    mutationFn: (pid: number) => apiPost('/api/cart/items', { product_id: pid, quantity: 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cart'] }); toast.push('success', t('common.success')); },
  });

  if (favs.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('nav.favorites')}</h1>
      {(favs.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Star className="h-6 w-6" />}
          title={t('favorites.empty')}
          description={t('favorites.emptyHelp')}
          action={
            <Link className="btn-primary" to={`${basePath}/catalog`}>
              {t('nav.catalog')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(favs.data ?? []).map((p: any) => (
            <div key={p.product_id} className="card flex items-center gap-3 p-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-muted">
                {p.image_path ? (
                  <img src={p.image_path} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-fg">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{lang === 'en' ? p.name_en : p.name_fr}</div>
                <div className="text-xs text-muted-fg">{p.code} · {t(`units.${p.unit}`)}</div>
              </div>
              <button className="btn-ghost p-1 text-accent" onClick={() => remove.mutate(p.product_id)} title={t('favorites.remove')}>
                <Star className="h-4 w-4 fill-current" />
              </button>
              <button className="btn-ghost p-1" onClick={() => addToCart.mutate(p.product_id)} title={t('order.addToCart')}>
                <ShoppingCart className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
