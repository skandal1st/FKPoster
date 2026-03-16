import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { usePartnerStore } from '../../store/partnerStore';

export default function PartnerLogin() {
  const { partner, login } = usePartnerStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (partner) return <Navigate to="/partner" />;

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
          <div className="login-logo-icon" aria-hidden>P</div>
          <div>
            <h1 className="login-title">Партнёрская программа</h1>
            <p className="login-subtitle">Вход в кабинет</p>
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
            required
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
            required
          />
        </div>
        <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Нет аккаунта? <Link to="/partner/register">Регистрация</Link>
        </p>
      </form>
    </div>
  );
}
