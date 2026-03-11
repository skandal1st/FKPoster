import { useState } from 'react';
import { setTenantSlug, getBaseDomain } from '../utils/subdomain';

/**
 * Экран выбора заведения для Capacitor-режима.
 * Кассир вводит slug (адрес) своего заведения, затем приложение перезагружается.
 */
export default function TenantSelect() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const domain = getBaseDomain();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setError('Введите адрес заведения');
      return;
    }

    setLoading(true);
    setError('');

    // Проверить что заведение существует
    try {
      const res = await fetch(`https://${trimmed}.${domain}/api/auth/tenant-info`);
      if (!res.ok) {
        setError('Заведение не найдено. Проверьте адрес.');
        setLoading(false);
        return;
      }
      // Успешно — сохраняем slug и перезагружаем
      setTenantSlug(trimmed);
      window.location.reload();
    } catch {
      setError('Не удалось связаться с сервером. Проверьте подключение к интернету.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)',
        padding: 32, width: '100%', maxWidth: 420,
        border: '1px solid var(--border-color)',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
          HookahPOS
        </h1>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 24 }}>
          Введите адрес вашего заведения
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            background: 'var(--bg-input)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)', overflow: 'hidden',
          }}>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, ''))}
              placeholder="my-bar"
              autoFocus
              style={{
                flex: 1, padding: '12px 16px', border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text-primary)', fontSize: 16,
              }}
            />
            <span style={{
              padding: '12px 16px', color: 'var(--text-muted)', fontSize: 14,
              borderLeft: '1px solid var(--border-color)', whiteSpace: 'nowrap',
            }}>
              .{domain}
            </span>
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', marginTop: 16, padding: '12px 24px',
              background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)',
              fontSize: 16, fontWeight: 600, opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Проверка...' : 'Подключиться'}
          </button>
        </form>
      </div>
    </div>
  );
}
