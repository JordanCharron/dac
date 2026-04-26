import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Minus, ShoppingCart, Image as ImageIcon, Star } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatQty } from '@/lib/format';

export function ClientCatalog() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [supplier, setSupplier] = useState<string>('');
  const [sort, setSort] = useState<'name' | 'price_asc' | 'price_desc' | 'available_desc'>('name');
  const [favOnly, setFavOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);

  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiGet<any>('/api/products'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<any[]>('/api/categories'),
  });
  const favs = useQuery({
    queryKey: ['favorites'],
    queryFn: () => apiGet<any[]>('/api/favorites'),
  });

  const favIds = useMemo(() => new Set((favs.data ?? []).map((f: any) => f.product_id)), [favs.data]);

  const toggleFav = useMutation({
    mutationFn: async (args: { id: number; on: boolean }) =>
      args.on
        ? apiPost(`/api/favorites/${args.id}`)
        : apiDelete(`/api/favorites/${args.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const p of (catalog.data?.products as any[]) ?? []) if (p.supplier) set.add(p.supplier);
    return [...set].sort();
  }, [catalog.data]);

  const filtered = useMemo(() => {
    const items = (catalog.data?.products as any[]) ?? [];
    const needle = q.toLowerCase();
    let list = items.filter((p) => {
      if (categoryId && String(p.category_id) !== categoryId) return false;
      if (supplier && p.supplier !== supplier) return false;
      if (favOnly && !favIds.has(p.id)) return false;
      if (inStockOnly && (p.available ?? 0) <= 0) return false;
      if (q && !p.name_fr.toLowerCase().includes(needle) && !p.name_en.toLowerCase().includes(needle) && !p.code.toLowerCase().includes(needle)) return false;
      return true;
    });
    switch (sort) {
      case 'price_asc': list = list.slice().sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)); break;
      case 'price_desc': list = list.slice().sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)); break;
      case 'available_desc': list = list.slice().sort((a, b) => (b.available ?? 0) - (a.available ?? 0)); break;
    }
    return list;
  }, [catalog.data, q, categoryId, supplier, favOnly, inStockOnly, sort, favIds]);

  if (catalog.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('nav.catalog')}</h1>
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
          <select className="input mt-1 w-40" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {(categories.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'en' ? c.name_en : c.name_fr}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('catalog.supplier')}</label>
          <select className="input mt-1 w-40" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('catalog.sort')}</label>
          <select className="input mt-1 w-40" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="name">{t('catalog.sortName')}</option>
            <option value="price_asc">{t('catalog.sortPriceAsc')}</option>
            <option value="price_desc">{t('catalog.sortPriceDesc')}</option>
            <option value="available_desc">{t('catalog.sortAvailable')}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
          {t('catalog.favoritesOnly')}
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          {t('catalog.inStockOnly')}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p: any) => (
          <ProductCard
            key={p.id}
            product={p}
            isFavorite={favIds.has(p.id)}
            onToggleFav={() => toggleFav.mutate({ id: p.id, on: !favIds.has(p.id) })}
            onAdd={async (qty) => {
              try {
                await apiPost('/api/cart/items', { product_id: p.id, quantity: qty });
                qc.invalidateQueries({ queryKey: ['cart'] });
                qc.invalidateQueries({ queryKey: ['catalog'] });
                toast.push('success', `${p.name_fr}: +${qty} ${p.unit}`);
              } catch {
                toast.push('error', t('common.error'));
              }
            }}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-muted-fg">{t('product.noProducts')}</p>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, onAdd, isFavorite, onToggleFav }: { product: any; onAdd: (qty: number) => void; isFavorite: boolean; onToggleFav: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [qty, setQty] = useState(1);
  const name = lang === 'en' ? product.name_en : product.name_fr;
  const description = lang === 'en' ? product.description_en : product.description_fr;
  const available = product.available ?? 0;
  const outOfStock = available <= 0;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative aspect-square bg-muted">
        {product.image_path ? (
          <img src={product.image_path} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-fg">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          className="absolute top-2 right-2 rounded-full bg-bg/80 p-1.5 backdrop-blur hover:bg-bg"
          title={isFavorite ? t('favorites.remove') : t('favorites.add')}
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-accent text-accent' : 'text-muted-fg'}`} />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-3 gap-2">
        <div className="text-xs text-muted-fg">{product.code}</div>
        <h3 className="font-medium leading-tight">{name}</h3>
        {product.cut_grade && <div className="text-xs text-muted-fg">{product.cut_grade}</div>}
        {description && <p className="text-xs text-muted-fg line-clamp-2">{description}</p>}
        <div className="mt-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <div className="font-semibold">
                {product.quote_mode ? t('product.onDemand') : formatMoney(product.price, lang)}
              </div>
              <div className="text-xs text-muted-fg">/ {t(`units.${product.unit}`)}</div>
            </div>
            <div className="text-xs text-right">
              <div className={outOfStock ? 'text-danger font-medium' : 'text-success'}>
                {outOfStock ? '0' : formatQty(available, product.unit, lang)}
              </div>
              <div className="text-muted-fg">{t('product.available')}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border">
              <button type="button" className="btn-ghost h-9 px-2" onClick={() => setQty((q) => Math.max(0.5, q - 0.5))}>
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="w-14 bg-transparent text-center text-sm outline-none"
                value={qty}
                onChange={(e) => setQty(Math.max(0.5, Number(e.target.value)))}
              />
              <button type="button" className="btn-ghost h-9 px-2" onClick={() => setQty((q) => q + 0.5)}>
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <button
              className="btn-primary flex-1"
              disabled={outOfStock || qty > available}
              onClick={() => onAdd(qty)}
            >
              <ShoppingCart className="h-4 w-4" />
              {t('order.addToCart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
