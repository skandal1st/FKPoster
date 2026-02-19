import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const { user, register } = useAuthStore();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(companyName, name, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <h1 className="login-title">HookahPOS</h1>
        <p className="login-subtitle">Создать аккаунт</p>

        {error && <div className="login-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Название компании</label>
          <input
            className="form-input"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Моя кальянная"
            autoFocus
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Ваше имя</label>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Иванов"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mail@example.com"
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
            placeholder="Минимум 6 символов"
            minLength={6}
            required
          />
        </div>
        <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
          {loading ? 'Создание...' : 'Создать аккаунт'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
}
