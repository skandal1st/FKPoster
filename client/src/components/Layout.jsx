import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';
import {
  ShoppingCart, Map, LayoutGrid, Package, Truck, Settings,
  CreditCard, Users, BarChart3, LogOut, Boxes, ClipboardList, LayoutDashboard,
  Building2, FlaskConical, LogIn, ScanBarcode, Wine, Tag, UserCircle, FolderOpen, Warehouse
} from 'lucide-react';

export default function Layout() {
  const { user, tenant, logout, exitImpersonation } = useAuthStore();
  const navigate = useNavigate();
  const [impersonating, setImpersonating] = useState(!!sessionStorage.getItem('superadmin_token'));
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const isOwner = user?.role === 'owner';
  const isCashier = user?.role === 'cashier';
  const [lowStockCount, setLowStockCount] = useState(0);
  const [integrations, setIntegrations] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/products/low-stock').then((d) => setLowStockCount(d.count)).catch(() => {});
      api.get('/integrations').then(setIntegrations).catch(() => {});
    }
  }, [isAdmin]);

  const hasMarking = integrations && (integrations.egais_enabled || integrations.chestniy_znak_enabled);

  const handleExitImpersonation = async () => {
    await exitImpersonation();
    navigate('/superadmin');
  };

  return (
    <div className={`app-layout${impersonating && tenant ? ' app-layout-with-banner' : ''}`}>
      {impersonating && tenant && (
        <div className="impersonation-banner">
          <span>Вы вошли как суперадмин: <strong>{tenant.name}</strong></span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
            onClick={handleExitImpersonation}
          >
            <LogIn size={14} /> Выйти из заведения
          </button>
        </div>
      )}
      <aside className="sidebar glass-sidebar">
        <div className="sidebar-logo">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt="" className="sidebar-logo-icon" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="sidebar-logo-icon" aria-hidden>{tenant?.name?.charAt(0) || 'H'}</div>
          )}
          <span>{tenant?.name || 'HookahPOS'}</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Работа</div>
            <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Map /> Зал
            </NavLink>
            {isAdmin && (
              <NavLink to="/hall-map" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Settings /> Редактировать карту
              </NavLink>
            )}
            <NavLink to="/admin/register" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <CreditCard /> Кассовый день
            </NavLink>
          </div>

          {isAdmin && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Админ</div>
              <NavLink to="/admin/categories" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <LayoutGrid /> Категории
              </NavLink>
              <NavLink to="/admin/workshops" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Warehouse /> Цеха
              </NavLink>
              <NavLink to="/admin/products" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Package /> Товары
                {lowStockCount > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                    borderRadius: '50%', width: 20, height: 20, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700
                  }}>{lowStockCount}</span>
                )}
              </NavLink>
              <NavLink to="/admin/ingredients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <FlaskConical /> Ингредиенты
              </NavLink>
              <NavLink to="/admin/ingredient-groups" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <FolderOpen /> Группы ингредиентов
              </NavLink>
              <NavLink to="/admin/inventory" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Boxes /> Остатки
              </NavLink>
              <NavLink to="/admin/supplies" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Truck /> Поставки
              </NavLink>
              <NavLink to="/admin/inventory-check" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <ClipboardList /> Инвентаризация
              </NavLink>
              <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Users /> Пользователи
              </NavLink>
              <NavLink to="/admin/guests" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <UserCircle /> Гости и скидки
              </NavLink>
            </div>
          )}

          {isAdmin && hasMarking && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Маркировка</div>
              {integrations.egais_enabled && (
                <NavLink to="/admin/egais" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <Wine /> ЕГАИС
                </NavLink>
              )}
              <NavLink to="/admin/marked-items" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Tag /> Маркированные товары
              </NavLink>
              {isOwner && (
                <NavLink to="/admin/integrations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <ScanBarcode /> Настройки интеграций
                </NavLink>
              )}
            </div>
          )}

          <div className="sidebar-section">
            <div className="sidebar-section-title">Аналитика</div>
            {(isAdmin || isCashier) && (
              <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <LayoutDashboard /> Дашборд
              </NavLink>
            )}
            {!isCashier && (
              <NavLink to="/stats" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <BarChart3 /> Статистика
              </NavLink>
            )}
          </div>

          {(isAdmin || isOwner) && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Компания</div>
              <NavLink to="/admin/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Building2 /> Настройки
              </NavLink>
              {isOwner && !hasMarking && (
                <NavLink to="/admin/integrations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <ScanBarcode /> Интеграции
                </NavLink>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span>{user?.name}</span>
            <button className="btn-icon" onClick={logout} title="Выход">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
