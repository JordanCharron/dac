import { useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Header } from './Header';
import { NavLinkTab } from './NavLinkTab';
import { ImpersonationBanner } from '@/features/impersonation/ImpersonationBanner';
import { useImpersonation } from '@/features/impersonation/ImpersonationContext';

export function AdminAsLayout() {
  const { t } = useTranslation();
  const { acting } = useImpersonation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!acting) navigate('/admin/as', { replace: true });
  }, [acting, navigate]);

  const { data } = useQuery({
    queryKey: ['cart', acting?.id],
    queryFn: () => apiGet('/api/cart'),
    enabled: !!acting,
  });
  const count = (data as any)?.items?.length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        <Link to="/admin" className="btn-ghost rounded-md px-2 py-1.5 text-sm text-muted-fg hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
          {t('impersonate.backToAdmin')}
        </Link>
        <NavLinkTab to="/admin/as/catalog">{t('nav.catalog')}</NavLinkTab>
        <NavLinkTab to="/admin/as/cart">
          <span className="inline-flex items-center gap-1">
            <ShoppingCart className="h-4 w-4" />
            {t('nav.cart')}
            {count > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{count}</span>}
          </span>
        </NavLinkTab>
        <NavLinkTab to="/admin/as/orders">{t('nav.myOrders')}</NavLinkTab>
      </Header>
      <ImpersonationBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
