import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Building2, LogOut } from 'lucide-react';

export default function SuperadminLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Суперадмин</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Управление</div>
            <NavLink to="/superadmin" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Building2 size={18} /> Заведения
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-footer">
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
