import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AdminAsLayout } from '@/components/layout/AdminAsLayout';
import { PageSpinner } from '@/components/ui/spinner';
import { AdminDashboard } from '@/features/admin-dashboard/AdminDashboard';
import { AdminProducts } from '@/features/admin-products/AdminProducts';
import { AdminCategories } from '@/features/admin-categories/AdminCategories';
import { AdminPriceLists } from '@/features/admin-price-lists/AdminPriceLists';
import { AdminPriceListEdit } from '@/features/admin-price-lists/AdminPriceListEdit';
import { AdminClients } from '@/features/admin-clients/AdminClients';
import { AdminOrders } from '@/features/admin-orders/AdminOrders';
import { AdminOrderDetail } from '@/features/admin-orders/AdminOrderDetail';
import { AdminAudit } from '@/features/admin-audit/AdminAudit';
import { ClientCatalog } from '@/features/client-catalog/ClientCatalog';
import { ClientCart } from '@/features/client-cart/ClientCart';
import { ClientOrders } from '@/features/client-orders/ClientOrders';
import { ClientOrderDetail } from '@/features/client-orders/ClientOrderDetail';
import { ClientProfile } from '@/features/client-profile/ClientProfile';
import { ClientFavorites } from '@/features/client-favorites/ClientFavorites';
import { ClientTemplates } from '@/features/client-templates/ClientTemplates';
import { ImpersonationProvider } from '@/features/impersonation/ImpersonationContext';
import { ImpersonationPicker } from '@/features/impersonation/ImpersonationPicker';
import { AcceptPage } from '@/features/accept/AcceptPage';

function Gate() {
  const { me, loading } = useAuth();

  // Public accept route — no auth required
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/accept/')) {
    return (
      <Routes>
        <Route path="/accept/:token" element={<AcceptPage />} />
      </Routes>
    );
  }

  if (loading) return <PageSpinner />;
  if (!me) return <LoginPage />;
  if (me.must_change_password) return <ChangePasswordPage mandatory />;

  return (
    <Routes>
      {me.role === 'admin' ? (
        <>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/categories" element={<AdminCategories />} />
            <Route path="/admin/price-lists" element={<AdminPriceLists />} />
            <Route path="/admin/price-lists/:id" element={<AdminPriceListEdit />} />
            <Route path="/admin/clients" element={<AdminClients />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/orders/:id" element={<AdminOrderDetail />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/as" element={<ImpersonationPicker />} />
          </Route>
          <Route element={<AdminAsLayout />}>
            <Route path="/admin/as/catalog" element={<ClientCatalog />} />
            <Route path="/admin/as/cart" element={<ClientCart />} />
            <Route path="/admin/as/orders" element={<ClientOrders />} />
            <Route path="/admin/as/orders/:id" element={<ClientOrderDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        <Route element={<ClientLayout />}>
          <Route index element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<ClientCatalog />} />
          <Route path="/cart" element={<ClientCart />} />
          <Route path="/favorites" element={<ClientFavorites />} />
          <Route path="/templates" element={<ClientTemplates />} />
          <Route path="/orders" element={<ClientOrders />} />
          <Route path="/orders/:id" element={<ClientOrderDetail />} />
          <Route path="/profile" element={<ClientProfile />} />
          <Route path="*" element={<Navigate to="/catalog" replace />} />
        </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ImpersonationProvider>
        <Gate />
      </ImpersonationProvider>
    </AuthProvider>
  );
}
