import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { buildSubdomainUrl } from '../utils/subdomain';

const TRANSLIT_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(str) {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 63);
}

function validateSlugClient(slug) {
  if (slug.length < 3) return 'Минимум 3 символа';
  if (slug.length > 63) return 'Максимум 63 символа';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'Только латиница, цифры и дефис';
  return null;
}

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'lvh.me';

export default function RegisterPage() {
  const { user, register } = useAuthStore();
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 2 fields
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugError, setSlugError] = useState('');
  const [city, setCity] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(null);

  if (user) return <Navigate to="/" />;

  const previewSlug = slug || transliterate(companyName) || 'my-hookah-bar';

  const handleSlugChange = (value) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(normalized);
    if (normalized) {
      setSlugError(validateSlugClient(normalized) || '');
    } else {
      setSlugError('');
    }
  };

  const handleStep1 = (e) => {
    e.preventDefault();
    setError('');
    if (!name || !phone || !email || !password) {
      setError('Заполните все поля');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }
    setStep(2);
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    setError('');
    if (!companyName) {
      setError('Введите название заведения');
      return;
    }
    if (slug) {
      const err = validateSlugClient(slug);
      if (err) {
        setSlugError(err);
        return;
      }
    }
    setLoading(true);
    try {
      const data = await register(companyName, name, email, password, slug || undefined, phone, city || undefined);
      setRegistered(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // After successful registration
  if (registered && registered.tenant?.slug) {
    const subUrl = buildSubdomainUrl(registered.tenant.slug) + '/login?token=' + registered.token;
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 className="login-title">Компания создана!</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, marginBottom: 20, lineHeight: 1.5 }}>
            Ваше заведение <strong>{registered.tenant.name}</strong> доступно по адресу:
          </p>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: 'var(--accent)' }}>
            {registered.tenant.slug}.{BASE_DOMAIN}
          </p>
          <a href={subUrl} className="btn btn-primary login-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Перейти в систему
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 420 }}>
        <h1 className="login-title">HookahPOS</h1>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
            background: 'var(--accent)', color: '#fff',
          }}>1</div>
          <div style={{ width: 32, height: 2, background: step >= 2 ? 'var(--accent)' : 'var(--border)' }} />
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
            background: step >= 2 ? 'var(--accent)' : 'var(--bg-secondary)',
            color: step >= 2 ? '#fff' : 'var(--text-muted)',
          }}>2</div>
        </div>

        {error && <div className="login-error">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleStep1}>
            <p className="login-subtitle">Создать аккаунт</p>
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
              <label className="form-label">Телефон</label>
              <input
                className="form-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 (999) 123-45-67"
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
            <button className="btn btn-primary login-btn" type="submit">
              Создать аккаунт
            </button>
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              Уже есть аккаунт? <Link to="/login">Войти</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2}>
            <p className="login-subtitle">Настройка заведения</p>
            <div className="form-group">
              <label className="form-label">Название заведения</label>
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
              <label className="form-label">Адрес заведения</label>
              <input
                className="form-input"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-hookah-bar"
              />
              <div style={{ fontSize: 13, marginTop: 4, color: slugError ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {slugError || <>{previewSlug}.{BASE_DOMAIN}</>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Город</label>
              <input
                className="form-input"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Москва"
              />
            </div>
            <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
              {loading ? 'Создание...' : 'Завершить регистрацию'}
            </button>
            <button
              type="button"
              className="btn btn-ghost login-btn"
              style={{ marginTop: 8 }}
              onClick={() => { setError(''); setStep(1); }}
            >
              Назад
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
