import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Building2, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export default function SuperadminLayout() {
  const { user, logout } = useAuthStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar glass-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden>S</div>
          <span>Суперадмин</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Управление</div>
            <NavLink to="/superadmin" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Заведения">
              <Building2 size={18} /><span className="sidebar-link-text">Заведения</span>
            </NavLink>
          </div>
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
