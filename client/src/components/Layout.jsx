import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';
import { toggleTheme, getCurrentTheme } from '../utils/branding';
import {
  Map, Package, Settings,
  CreditCard, Users, BarChart3, LogOut, Boxes, LayoutDashboard,
  Building2, LogIn, ScanBarcode, Wine, Tag, UserCircle,
  ChevronLeft, ChevronRight, Link2, FileText, BookUser, PackageCheck, Truck, Receipt,
  Sun, Moon, ShoppingBag
} from 'lucide-react';
import { CATALOG_TABS, STOCK_TABS, STAFF_TABS } from '../constants/tabGroups';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export default function Layout() {
  const { user, tenant, chain, plan, logout, exitImpersonation, exitChainImpersonation, impersonating, chainImpersonating } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isGroupActive = (tabs) => tabs.some((t) => t.path === location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  const [theme, setTheme] = useState(getCurrentTheme);
  const isFastPos = tenant?.pos_mode === 'fast_pos';

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const isOwner = user?.role === 'owner';
  const isCashier = user?.role === 'cashier';
  const hasReports = plan?.features?.reports === true;
  const hasInventory = plan?.features?.inventory === true;
  const [lowStockCount, setLowStockCount] = useState(0);
  const [integrations, setIntegrations] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      if (hasInventory) {
        api.get('/products/low-stock').then((d) => setLowStockCount(d.count)).catch(() => {});
      }
      api.get('/integrations').then(setIntegrations).catch(() => {});
    }
  }, [isAdmin, hasInventory]);

  const hasMarking = integrations && (integrations.egais_enabled || integrations.chestniy_znak_enabled);
  const hasEdo = integrations && integrations.edo_enabled;
  const hasKkt = integrations && integrations.kkt_enabled;
  const hasChainFeature = plan?.features?.chain_management === true;

  const handleExitImpersonation = async () => {
    await exitImpersonation();
    navigate('/superadmin');
  };

  const handleExitChainImpersonation = async () => {
    await exitChainImpersonation();
    navigate('/chain');
  };

  return (
    <div className={`app-layout${(impersonating || chainImpersonating) && tenant ? ' app-layout-with-banner' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
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
      {chainImpersonating && !impersonating && tenant && (
        <div className="impersonation-banner">
          <span>Вы в заведении: <strong>{tenant.name}</strong></span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
            onClick={handleExitChainImpersonation}
          >
            <LogIn size={14} /> Вернуться к сети
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
            <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title={isFastPos ? 'Касса' : 'Зал'}>
              {isFastPos ? <ShoppingBag /> : <Map />}<span className="sidebar-link-text">{isFastPos ? 'Касса' : 'Зал'}</span>
            </NavLink>
            {isAdmin && !isFastPos && (
              <NavLink to="/hall-map" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Редактировать карту">
                <Settings /><span className="sidebar-link-text">Редактировать карту</span>
              </NavLink>
            )}
            <NavLink to="/admin/register" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Кассовый день">
              <CreditCard /><span className="sidebar-link-text">Кассовый день</span>
            </NavLink>
          </div>

          {isAdmin && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Админ</div>
              <NavLink to="/admin/products" className={() => `sidebar-link ${isGroupActive(CATALOG_TABS) ? 'active' : ''}`} title="Каталог">
                <Package /><span className="sidebar-link-text">Каталог</span>
              </NavLink>
              {hasInventory && (
                <NavLink to="/admin/inventory" className={() => `sidebar-link ${isGroupActive(STOCK_TABS) ? 'active' : ''}`} title="Склад">
                  <Boxes /><span className="sidebar-link-text">Склад</span>
                  {lowStockCount > 0 && (
                    <span className="sidebar-link-badge" style={{
                      marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                      borderRadius: '50%', width: 20, height: 20, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700
                    }}>{lowStockCount}</span>
                  )}
                </NavLink>
              )}
              <NavLink to="/admin/users" className={() => `sidebar-link ${isGroupActive(STAFF_TABS) ? 'active' : ''}`} title="Персонал">
                <Users /><span className="sidebar-link-text">Персонал</span>
              </NavLink>
              <NavLink to="/admin/guests" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Гости и скидки">
                <UserCircle /><span className="sidebar-link-text">Гости и скидки</span>
              </NavLink>
            </div>
          )}

          {isAdmin && hasMarking && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Маркировка</div>
              {integrations.egais_enabled && (
                <NavLink to="/admin/egais" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="ЕГАИС">
                  <Wine /><span className="sidebar-link-text">ЕГАИС</span>
                </NavLink>
              )}
              <NavLink to="/admin/marked-items" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Маркированные товары">
                <Tag /><span className="sidebar-link-text">Маркированные товары</span>
              </NavLink>
              {isOwner && (
                <NavLink to="/admin/integrations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Настройки интеграций">
                  <ScanBarcode /><span className="sidebar-link-text">Настройки интеграций</span>
                </NavLink>
              )}
            </div>
          )}

          {isAdmin && (hasEdo || hasMarking || hasKkt) && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Документооборот</div>
              {hasEdo && (
                <NavLink to="/admin/edo" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="ЭДО документы">
                  <FileText /><span className="sidebar-link-text">ЭДО документы</span>
                </NavLink>
              )}
              {hasKkt && (
                <NavLink to="/admin/kkt" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Чеки ККТ">
                  <Receipt /><span className="sidebar-link-text">Чеки ККТ</span>
                </NavLink>
              )}
              <NavLink to="/admin/counterparties" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Контрагенты">
                <BookUser /><span className="sidebar-link-text">Контрагенты</span>
              </NavLink>
              {(hasEdo || hasMarking) && (
                <NavLink to="/admin/receiving" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Приёмка">
                  <PackageCheck /><span className="sidebar-link-text">Приёмка</span>
                </NavLink>
              )}
            </div>
          )}

          {hasReports && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Аналитика</div>
              {(isAdmin || isCashier) && (
                <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Дашборд">
                  <LayoutDashboard /><span className="sidebar-link-text">Дашборд</span>
                </NavLink>
              )}
              {!isCashier && (
                <NavLink to="/stats" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Статистика">
                  <BarChart3 /><span className="sidebar-link-text">Статистика</span>
                </NavLink>
              )}
            </div>
          )}

          {(isAdmin || isOwner) && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Компания</div>
              <NavLink to="/admin/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Настройки">
                <Building2 /><span className="sidebar-link-text">Настройки</span>
              </NavLink>
              {isOwner && !hasMarking && (
                <NavLink to="/admin/integrations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Интеграции">
                  <ScanBarcode /><span className="sidebar-link-text">Интеграции</span>
                </NavLink>
              )}
            </div>
          )}

          {isOwner && chain && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Сеть</div>
              <NavLink to="/chain" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Дашборд сети">
                <Link2 /><span className="sidebar-link-text">Дашборд сети</span>
              </NavLink>
              <NavLink to="/chain/tenants" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Заведения сети">
                <Building2 /><span className="sidebar-link-text">Заведения сети</span>
              </NavLink>
              <NavLink to="/chain/transfers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Перемещения">
                <Truck /><span className="sidebar-link-text">Перемещения</span>
              </NavLink>
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
          <button
            type="button"
            className="btn btn-ghost sidebar-toggle-btn"
            onClick={() => setTheme(toggleTheme())}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="sidebar-toggle-text">{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          </button>
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
