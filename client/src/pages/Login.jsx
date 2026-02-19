import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const { user, tenant, login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user && !(user.role === 'superadmin' && !tenant)) return <Navigate to="/" />;
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
        <h1 className="login-title">HookahPOS</h1>
        <p className="login-subtitle">Вход в систему</p>

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
