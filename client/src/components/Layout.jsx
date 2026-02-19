import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';
import {
  ShoppingCart, Map, LayoutGrid, Package, Truck, Settings,
  CreditCard, Users, BarChart3, LogOut, Boxes, ClipboardList, LayoutDashboard,
  Building2, UserCog, FlaskConical
} from 'lucide-react';

export default function Layout() {
  const { user, tenant, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const isOwner = user?.role === 'owner';
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    if (isAdmin) {
      api.get('/products/low-stock').then((d) => setLowStockCount(d.count)).catch(() => {});
    }
  }, [isAdmin]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
          ) : null}
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
              <NavLink to="/admin/team" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <UserCog /> Команда
              </NavLink>
            </div>
          )}

          <div className="sidebar-section">
            <div className="sidebar-section-title">Аналитика</div>
            {isAdmin && (
              <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <LayoutDashboard /> Дашборд
              </NavLink>
            )}
            <NavLink to="/stats" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <BarChart3 /> Статистика
            </NavLink>
          </div>

          {isOwner && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Компания</div>
              <NavLink to="/admin/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Building2 /> Настройки
              </NavLink>
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
