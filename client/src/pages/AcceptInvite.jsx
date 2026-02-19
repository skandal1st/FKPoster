import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api';

export default function AcceptInvite() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" />;
  if (!token) return <Navigate to="/login" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/accept-invite', { token, name, password });
      localStorage.setItem('token', data.token);
      window.location.href = '/';
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
        <p className="login-subtitle">Принять приглашение</p>

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
      </form>
    </div>
  );
}
