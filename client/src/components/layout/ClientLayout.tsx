import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Header } from './Header';
import { NavLinkTab } from './NavLinkTab';

export function ClientLayout() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['cart'],
    queryFn: () => apiGet('/api/cart'),
    refetchInterval: 30_000,
  });
  const count = (data as any)?.items?.length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        <NavLinkTab to="/catalog">{t('nav.catalog')}</NavLinkTab>
        <NavLinkTab to="/cart">
          <span className="inline-flex items-center gap-1">
            <ShoppingCart className="h-4 w-4" />
            {t('nav.cart')}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{count}</span>
            )}
          </span>
        </NavLinkTab>
        <NavLinkTab to="/favorites">
          <span className="inline-flex items-center gap-1">
            <Star className="h-4 w-4" />
            {t('nav.favorites')}
          </span>
        </NavLinkTab>
        <NavLinkTab to="/templates">{t('nav.templates')}</NavLinkTab>
        <NavLinkTab to="/orders">{t('nav.myOrders')}</NavLinkTab>
        <NavLinkTab to="/profile">{t('nav.profile')}</NavLinkTab>
      </Header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
