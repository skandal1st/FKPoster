import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Layout from './Layout';
import SuperadminLayout from './SuperadminLayout';
import ChainLayout from './ChainLayout';

export default function LayoutSwitch() {
  const { user, tenant, chain } = useAuthStore();
  const location = useLocation();

  // chain_owner без tenant — всегда ChainLayout
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

  // Owner с chain_id на /chain/* — показываем ChainLayout
  const ownerWithChain = user?.role === 'owner' && chain;
  if (ownerWithChain && location.pathname.startsWith('/chain')) {
    return <ChainLayout><Outlet /></ChainLayout>;
  }

  // Если нет chain — не пускаем на /chain/*
  if (!ownerWithChain && location.pathname.startsWith('/chain')) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
