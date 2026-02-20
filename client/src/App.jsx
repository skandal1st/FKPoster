import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LayoutSwitch from './components/LayoutSwitch';
import SuperadminTenants from './pages/superadmin/SuperadminTenants';
import Login from './pages/Login';
import RegisterPage from './pages/Register';
import AcceptInvite from './pages/AcceptInvite';
import HallMap from './pages/HallMap';
import Categories from './pages/admin/Categories';
import Products from './pages/admin/Products';
import Ingredients from './pages/admin/Ingredients';
import Supplies from './pages/admin/Supplies';
import Register from './pages/admin/Register';
import Users from './pages/admin/Users';
import Stats from './pages/Stats';
import Inventory from './pages/admin/Inventory';
import InventoryCheck from './pages/admin/InventoryCheck';
import Dashboard from './pages/Dashboard';
import TenantSettings from './pages/admin/TenantSettings';
import OwnerRoute from './components/OwnerRoute';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="spinner" style={{ marginTop: '40vh' }} />;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuthStore();
  if (user?.role !== 'admin' && user?.role !== 'owner') return <Navigate to="/" />;
  return children;
}

/** Кассир видит только зал, кассовый день и дашборд; остальные редирект на главную */
function CashierAllowedRoute({ children }) {
  const { user } = useAuthStore();
  const allowed = user?.role === 'cashier' || user?.role === 'admin' || user?.role === 'owner';
  if (!allowed) return <Navigate to="/" />;
  return children;
}

function StatsRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'cashier') return <Navigate to="/dashboard" replace />;
  return <Stats />;
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/" element={<ProtectedRoute><LayoutSwitch /></ProtectedRoute>}>
        <Route path="superadmin" element={<SuperadminTenants />} />
        <Route index element={<HallMap readOnly />} />
        <Route path="pos" element={<Navigate to="/" replace />} />
        <Route path="hall-map" element={<AdminRoute><HallMap /></AdminRoute>} />
        <Route path="admin/categories" element={<AdminRoute><Categories /></AdminRoute>} />
        <Route path="admin/products" element={<AdminRoute><Products /></AdminRoute>} />
        <Route path="admin/ingredients" element={<AdminRoute><Ingredients /></AdminRoute>} />
        <Route path="admin/supplies" element={<AdminRoute><Supplies /></AdminRoute>} />
        <Route path="admin/register" element={<Register />} />
        <Route path="admin/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="admin/inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
        <Route path="admin/inventory-check" element={<AdminRoute><InventoryCheck /></AdminRoute>} />
        <Route path="admin/settings" element={<OwnerRoute><TenantSettings /></OwnerRoute>} />
        <Route path="dashboard" element={<CashierAllowedRoute><Dashboard /></CashierAllowedRoute>} />
        <Route path="stats" element={<StatsRoute />} />
      </Route>
    </Routes>
  );
}
