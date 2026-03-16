import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { usePartnerStore } from '../store/partnerStore';
import { LayoutDashboard, Users, Wallet, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/partner', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/partner/referrals', label: 'Рефералы', icon: Users },
  { to: '/partner/payouts', label: 'Выплаты', icon: Wallet },
];

export default function PartnerLayout() {
  const partner = usePartnerStore((s) => s.partner);
  const logout = usePartnerStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/partner/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <aside style={{
        width: 240, padding: '24px 16px', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ padding: '0 8px', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Партнёрская программа
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {partner?.name}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, textDecoration: 'none',
                fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', width: '100%', textAlign: 'left',
          }}
        >
          <LogOut size={18} />
          Выйти
        </button>
      </aside>

      <main style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
