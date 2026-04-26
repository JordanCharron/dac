import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserCircle } from 'lucide-react';
import { Header } from './Header';
import { NavLinkTab } from './NavLinkTab';
import { useImpersonation } from '@/features/impersonation/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { useAdminStream } from '@/features/admin-notifications/useAdminStream';

export function AdminLayout() {
  const { t } = useTranslation();
  const { acting } = useImpersonation();
  const navigate = useNavigate();
  useAdminStream();

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        <NavLinkTab to="/admin">{t('nav.dashboard')}</NavLinkTab>
        <NavLinkTab to="/admin/orders">{t('nav.orders')}</NavLinkTab>
        <NavLinkTab to="/admin/products">{t('nav.inventory')}</NavLinkTab>
        <NavLinkTab to="/admin/categories">{t('nav.categories')}</NavLinkTab>
        <NavLinkTab to="/admin/price-lists">{t('nav.priceLists')}</NavLinkTab>
        <NavLinkTab to="/admin/clients">{t('nav.clients')}</NavLinkTab>
        <NavLinkTab to="/admin/audit">{t('nav.audit')}</NavLinkTab>
        <button
          className="ml-2 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20"
          onClick={() => navigate(acting ? '/admin/as/catalog' : '/admin/as')}
          title={t('impersonate.viewClient')}
        >
          <UserCircle className="h-4 w-4" />
          {acting ? acting.company_name : t('impersonate.viewClient')}
        </button>
      </Header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
