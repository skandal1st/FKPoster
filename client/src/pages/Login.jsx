import { useState, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { buildSubdomainUrl } from '../utils/subdomain';

export default function Login() {
  const { user, tenant, token: storeToken, login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const redirectingRef = useRef(false);

  // После логина owner'а на главном домене — редирект на сабдомен
  if (redirectingRef.current) {
    return <div className="spinner" style={{ marginTop: '40vh' }} />;
  }

  if (user && tenant?.slug && user.role !== 'superadmin' && user.role !== 'chain_owner') {
    redirectingRef.current = true;
    // Очищаем токен с основного домена, чтобы при следующем заходе
    // на skandata.ru не было автоматического редиректа на сабдомен
    localStorage.removeItem('token');
    // Читаем токен из Zustand store (не из localStorage, который уже очищен)
    const subUrl = buildSubdomainUrl(tenant.slug) + '/login?token=' + storeToken;
    window.location.href = subUrl;
    return <div className="spinner" style={{ marginTop: '40vh' }} />;
  }

  if (user?.role === 'chain_owner' && !tenant) return <Navigate to="/chain" />;
  if (user && !(user.role === 'superadmin' && !tenant)) return <Navigate to="/dashboard" />;
  if (user?.role === 'superadmin' && !tenant) return <Navigate to="/superadmin" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo-wrap">
          <div className="login-logo-icon" aria-hidden>H</div>
          <div>
            <h1 className="login-title">HookahPOS</h1>
            <p className="login-subtitle">Вход в систему</p>
          </div>
        </div>

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
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      </form>
    </div>
  );
}
