import { useState, useEffect, useCallback } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';
import { applyBranding } from '../utils/branding';
import { ArrowLeft, Delete } from 'lucide-react';

const roleLabel = (r) => {
  if (r === 'owner') return 'Владелец';
  if (r === 'admin') return 'Администратор';
  return 'Кассир';
};

export default function PinLogin() {
  const { user, login, pinLogin } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [employees, setEmployees] = useState([]);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Режим email/password
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Авто-логин по ?token=
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam && tokenParam !== 'null' && tokenParam !== 'undefined') {
      localStorage.setItem('token', tokenParam);
      // Убираем token из URL, чтобы не мешал при обновлении страницы
      setSearchParams({}, { replace: true });
      useAuthStore.getState().checkAuth();
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    api.get('/auth/employees').then((data) => {
      setEmployees(data.employees || []);
      setTenantInfo(data.tenant || null);
      if (data.tenant) applyBranding(data.tenant);
    }).catch((err) => {
      if (err.message.includes('не найдено') || err.message.includes('404')) {
        setNotFound(true);
      }
    });
  }, []);

  // Авто-отправка PIN при вводе 4-й цифры
  useEffect(() => {
    if (pin.length === 4 && selected) {
      handlePinSubmit();
    }
  }, [pin]);

  const handlePinSubmit = async () => {
    if (!selected || pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      await pinLogin(selected.id, pin);
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = useCallback((digit) => {
    if (pin.length < 4) {
      setPin((p) => p + digit);
      setError('');
    }
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
  }, []);

  // Клавиатурный ввод
  useEffect(() => {
    if (!selected || emailMode) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKeyPress(e.key);
      if (e.key === 'Backspace') handleBackspace();
      if (e.key === 'Escape') { setSelected(null); setPin(''); setError(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, emailMode, handleKeyPress, handleBackspace]);

  if (user) return <Navigate to="/" />;

  if (notFound) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1 className="login-title">Заведение не найдено</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>
            Проверьте адрес и попробуйте снова.
          </p>
        </div>
      </div>
    );
  }

  // Режим email/password
  if (emailMode) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleEmailLogin}>
          {tenantInfo && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h1 className="login-title">{tenantInfo.name}</h1>
              <p className="login-subtitle">Вход по email</p>
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@example.com"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ваш пароль"
            />
          </div>
          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <a onClick={() => { setEmailMode(false); setError(''); }}>
              <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              К списку сотрудников
            </a>
          </p>
        </form>
      </div>
    );
  }

  // Режим PIN — выбор сотрудника
  if (!selected) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: 480 }}>
          {tenantInfo && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {tenantInfo.logo_url && (
                <img src={tenantInfo.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 12 }} />
              )}
              <h1 className="login-title">{tenantInfo.name}</h1>
              <p className="login-subtitle">Выберите сотрудника</p>
            </div>
          )}

          {employees.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>
              Нет сотрудников с PIN-кодом.
              <br />Попросите администратора создать сотрудников.
            </p>
          ) : (
            <div className="employee-list">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  className="employee-btn"
                  onClick={() => { setSelected(emp); setPin(''); setError(''); }}
                >
                  <span className="employee-name">{emp.name}</span>
                  <span className="employee-role">{roleLabel(emp.role)}</span>
                </button>
              ))}
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <a onClick={() => { setEmailMode(true); setError(''); }}>
              Войти по email
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Режим PIN — ввод кода
  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 className="login-title" style={{ fontSize: 20 }}>{selected.name}</h2>
          <p className="login-subtitle">Введите PIN-код</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="pin-pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'back'].map((key, i) => {
              if (key === null) return <div key={i} />;
              if (key === 'back') {
                return (
                  <button key={i} className="pin-key pin-key-action" onClick={handleBackspace}>
                    <Delete size={20} />
                  </button>
                );
              }
              return (
                <button key={i} className="pin-key" onClick={() => handleKeyPress(String(key))}>
                  {key}
                </button>
              );
            })}
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <a onClick={() => { setSelected(null); setPin(''); setError(''); }}>
            <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Назад
          </a>
        </p>
      </div>
    </div>
  );
}
