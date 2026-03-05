import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { isSubdomain } from './utils/subdomain';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import LayoutSwitch from './components/LayoutSwitch';
import SuperadminTenants from './pages/superadmin/SuperadminTenants';
import Login from './pages/Login';
import RegisterPage from './pages/Register';
import AcceptInvite from './pages/AcceptInvite';
import PinLogin from './pages/PinLogin';
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
import IntegrationSettings from './pages/admin/IntegrationSettings';
import EgaisDocuments from './pages/admin/EgaisDocuments';
import MarkedItems from './pages/admin/MarkedItems';
import Guests from './pages/admin/Guests';
import IngredientGroups from './pages/admin/IngredientGroups';
import Workshops from './pages/admin/Workshops';
import HookahBOSLanding from './pages/HookahBOSLanding';
import ChainDashboard from './pages/chain/ChainDashboard';
import ChainTenants from './pages/chain/ChainTenants';
import ChainSales from './pages/chain/ChainSales';
import ChainComparison from './pages/chain/ChainComparison';
import ChainProducts from './pages/chain/ChainProducts';
import Schedule from './pages/admin/Schedule';
import Salary from './pages/admin/Salary';
import EdoDocumentsPage from './pages/admin/EdoDocuments';
import Counterparties from './pages/admin/Counterparties';
import Receiving from './pages/admin/Receiving';
import ChainTransfers from './pages/chain/ChainTransfers';

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

function FeatureRoute({ feature, children }) {
  const plan = useAuthStore((s) => s.plan);
  if (!plan?.features?.[feature]) return <Navigate to="/" replace />;
  return children;
}

function StatsRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'cashier') return <Navigate to="/dashboard" replace />;
  return <Stats />;
}

/** Приложение на сабдомене заведения */
function SubdomainApp() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<PinLogin />} />
      <Route path="/" element={<ProtectedRoute><LayoutSwitch /></ProtectedRoute>}>
        <Route index element={<HallMap readOnly />} />
        <Route path="pos" element={<Navigate to="/" replace />} />
        <Route path="hall-map" element={<AdminRoute><HallMap /></AdminRoute>} />
        <Route path="admin/categories" element={<AdminRoute><Categories /></AdminRoute>} />
        <Route path="admin/workshops" element={<AdminRoute><Workshops /></AdminRoute>} />
        <Route path="admin/products" element={<AdminRoute><Products /></AdminRoute>} />
        <Route path="admin/ingredients" element={<AdminRoute><Ingredients /></AdminRoute>} />
        <Route path="admin/ingredient-groups" element={<AdminRoute><IngredientGroups /></AdminRoute>} />
        <Route path="admin/supplies" element={<AdminRoute><FeatureRoute feature="inventory"><Supplies /></FeatureRoute></AdminRoute>} />
        <Route path="admin/register" element={<Register />} />
        <Route path="admin/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="admin/inventory" element={<AdminRoute><FeatureRoute feature="inventory"><Inventory /></FeatureRoute></AdminRoute>} />
        <Route path="admin/inventory-check" element={<AdminRoute><FeatureRoute feature="inventory"><InventoryCheck /></FeatureRoute></AdminRoute>} />
        <Route path="admin/settings" element={<AdminRoute><TenantSettings /></AdminRoute>} />
        <Route path="admin/integrations" element={<AdminRoute><IntegrationSettings /></AdminRoute>} />
        <Route path="admin/egais" element={<AdminRoute><EgaisDocuments /></AdminRoute>} />
        <Route path="admin/marked-items" element={<AdminRoute><MarkedItems /></AdminRoute>} />
        <Route path="admin/guests" element={<AdminRoute><Guests /></AdminRoute>} />
        <Route path="admin/schedule" element={<AdminRoute><Schedule /></AdminRoute>} />
        <Route path="admin/salary" element={<AdminRoute><Salary /></AdminRoute>} />
        <Route path="admin/edo" element={<AdminRoute><FeatureRoute feature="edo"><EdoDocumentsPage /></FeatureRoute></AdminRoute>} />
        <Route path="admin/counterparties" element={<AdminRoute><Counterparties /></AdminRoute>} />
        <Route path="admin/receiving" element={<AdminRoute><Receiving /></AdminRoute>} />
        <Route path="chain/transfers" element={<AdminRoute><ChainTransfers /></AdminRoute>} />
        <Route path="dashboard" element={<CashierAllowedRoute><FeatureRoute feature="reports"><Dashboard /></FeatureRoute></CashierAllowedRoute>} />
        <Route path="stats" element={<FeatureRoute feature="reports"><StatsRoute /></FeatureRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

/** Приложение на главном домене — регистрация, суперадмин, логин owner */
function MainDomainApp() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/" element={<HookahBOSLanding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/" element={<ProtectedRoute><LayoutSwitch /></ProtectedRoute>}>
        <Route path="superadmin" element={<SuperadminTenants />} />
        <Route path="chain" element={<ChainDashboard />} />
        <Route path="chain/tenants" element={<ChainTenants />} />
        <Route path="chain/sales" element={<ChainSales />} />
        <Route path="chain/comparison" element={<ChainComparison />} />
        <Route path="chain/products" element={<ChainProducts />} />
        <Route path="pos" element={<Navigate to="/" replace />} />
        <Route path="hall-map" element={<AdminRoute><HallMap /></AdminRoute>} />
        <Route path="admin/categories" element={<AdminRoute><Categories /></AdminRoute>} />
        <Route path="admin/workshops" element={<AdminRoute><Workshops /></AdminRoute>} />
        <Route path="admin/products" element={<AdminRoute><Products /></AdminRoute>} />
        <Route path="admin/ingredients" element={<AdminRoute><Ingredients /></AdminRoute>} />
        <Route path="admin/ingredient-groups" element={<AdminRoute><IngredientGroups /></AdminRoute>} />
        <Route path="admin/supplies" element={<AdminRoute><FeatureRoute feature="inventory"><Supplies /></FeatureRoute></AdminRoute>} />
        <Route path="admin/register" element={<Register />} />
        <Route path="admin/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="admin/inventory" element={<AdminRoute><FeatureRoute feature="inventory"><Inventory /></FeatureRoute></AdminRoute>} />
        <Route path="admin/inventory-check" element={<AdminRoute><FeatureRoute feature="inventory"><InventoryCheck /></FeatureRoute></AdminRoute>} />
        <Route path="admin/settings" element={<AdminRoute><TenantSettings /></AdminRoute>} />
        <Route path="admin/integrations" element={<AdminRoute><IntegrationSettings /></AdminRoute>} />
        <Route path="admin/egais" element={<AdminRoute><EgaisDocuments /></AdminRoute>} />
        <Route path="admin/marked-items" element={<AdminRoute><MarkedItems /></AdminRoute>} />
        <Route path="admin/guests" element={<AdminRoute><Guests /></AdminRoute>} />
        <Route path="admin/schedule" element={<AdminRoute><Schedule /></AdminRoute>} />
        <Route path="admin/salary" element={<AdminRoute><Salary /></AdminRoute>} />
        <Route path="admin/edo" element={<AdminRoute><FeatureRoute feature="edo"><EdoDocumentsPage /></FeatureRoute></AdminRoute>} />
        <Route path="admin/counterparties" element={<AdminRoute><Counterparties /></AdminRoute>} />
        <Route path="admin/receiving" element={<AdminRoute><Receiving /></AdminRoute>} />
        <Route path="chain/transfers" element={<AdminRoute><ChainTransfers /></AdminRoute>} />
        <Route path="dashboard" element={<CashierAllowedRoute><FeatureRoute feature="reports"><Dashboard /></FeatureRoute></CashierAllowedRoute>} />
        <Route path="stats" element={<FeatureRoute feature="reports"><StatsRoute /></FeatureRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {isSubdomain() ? <SubdomainApp /> : <MainDomainApp />}
    </ErrorBoundary>
  );
}
