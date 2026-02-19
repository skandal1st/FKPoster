import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Layout from './Layout';
import SuperadminLayout from './SuperadminLayout';

export default function LayoutSwitch() {
  const { user, tenant } = useAuthStore();
  const location = useLocation();
  const isSuperadminNoTenant = user?.role === 'superadmin' && !tenant;

  if (isSuperadminNoTenant) {
    if (location.pathname !== '/superadmin' && !location.pathname.startsWith('/superadmin/')) {
      return <Navigate to="/superadmin" replace />;
    }
    return <SuperadminLayout><Outlet /></SuperadminLayout>;
  }

  if (location.pathname === '/superadmin' || location.pathname.startsWith('/superadmin/')) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
