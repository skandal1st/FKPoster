import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  LayoutDashboard, Building2, BarChart3, GitCompare, Package,
  LogOut, ChevronLeft, ChevronRight, Link2, ArrowLeft
} from 'lucide-react';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export default function ChainLayout() {
  const { user, tenant, chain, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  // Owner с tenant может вернуться к своему заведению
  const isOwnerWithTenant = user?.role === 'owner' && tenant;

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar glass-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden><Link2 size={20} /></div>
          <span>{chain?.name || 'Сеть'}</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Аналитика</div>
            <NavLink to="/chain" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Дашборд">
              <LayoutDashboard size={18} /><span className="sidebar-link-text">Дашборд</span>
            </NavLink>
            <NavLink to="/chain/sales" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Продажи">
              <BarChart3 size={18} /><span className="sidebar-link-text">Продажи</span>
            </NavLink>
            <NavLink to="/chain/comparison" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Сравнение">
              <GitCompare size={18} /><span className="sidebar-link-text">Сравнение</span>
            </NavLink>
            <NavLink to="/chain/products" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Товары">
              <Package size={18} /><span className="sidebar-link-text">Товары</span>
            </NavLink>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Заведения</div>
            <NavLink to="/chain/tenants" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Список заведений">
              <Building2 size={18} /><span className="sidebar-link-text">Список заведений</span>
            </NavLink>
          </div>

          {isOwnerWithTenant && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Моё заведение</div>
              <button
                type="button"
                className="sidebar-link"
                onClick={() => navigate('/')}
                title="Вернуться в заведение"
                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <ArrowLeft size={18} /><span className="sidebar-link-text">Вернуться в {tenant.name}</span>
              </button>
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-ghost sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            <span className="sidebar-toggle-text">{sidebarCollapsed ? 'Развернуть' : 'Свернуть'}</span>
          </button>
          <div className="sidebar-user">
            <span>{user?.name}</span>
            <button className="btn-icon" onClick={logout} title="Выйти">
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
