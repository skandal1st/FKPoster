import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Layout from './Layout';
import SuperadminLayout from './SuperadminLayout';
import ChainLayout from './ChainLayout';

export default function LayoutSwitch() {
  const { user, tenant } = useAuthStore();
  const location = useLocation();

  const isChainOwner = user?.role === 'chain_owner' && !tenant;
  if (isChainOwner) {
    if (!location.pathname.startsWith('/chain')) {
      return <Navigate to="/chain" replace />;
    }
    return <ChainLayout><Outlet /></ChainLayout>;
  }

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
  if (location.pathname.startsWith('/chain')) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
