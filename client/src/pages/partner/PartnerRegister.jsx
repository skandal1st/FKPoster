import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { usePartnerStore } from '../../store/partnerStore';

export default function PartnerRegister() {
  const { partner, register } = usePartnerStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (partner) return <Navigate to="/partner" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }
    setLoading(true);
    try {
      await register(name, email, phone || undefined, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="login-logo-wrap">
          <div className="login-logo-icon" aria-hidden>P</div>
          <div>
            <h1 className="login-title">Партнёрская программа</h1>
            <p className="login-subtitle">Регистрация</p>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Ваше имя</label>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Иванов"
            autoFocus
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
          <label className="form-label">Телефон</label>
          <input
            className="form-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (999) 123-45-67"
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
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Уже есть аккаунт? <Link to="/partner/login">Войти</Link>
        </p>
      </form>
    </div>
  );
}
