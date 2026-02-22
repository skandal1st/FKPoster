import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Save, Wifi, WifiOff } from 'lucide-react';

export default function IntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    egais_enabled: false,
    egais_utm_host: 'localhost',
    egais_utm_port: 8080,
    egais_fsrar_id: '',
    chestniy_znak_enabled: false,
    chestniy_znak_token: '',
    chestniy_znak_omsid: '',
    chestniy_znak_environment: 'sandbox',
  });
  const [testResults, setTestResults] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await api.get('/integrations');
      setForm({
        egais_enabled: data.egais_enabled || false,
        egais_utm_host: data.egais_utm_host || 'localhost',
        egais_utm_port: data.egais_utm_port || 8080,
        egais_fsrar_id: data.egais_fsrar_id || '',
        chestniy_znak_enabled: data.chestniy_znak_enabled || false,
        chestniy_znak_token: data.chestniy_znak_token || '',
        chestniy_znak_omsid: data.chestniy_znak_omsid || '',
        chestniy_znak_environment: data.chestniy_znak_environment || 'sandbox',
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/integrations', form);
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testEgais = async () => {
    try {
      const result = await api.post('/integrations/test-egais', {
        egais_utm_host: form.egais_utm_host,
        egais_utm_port: form.egais_utm_port,
      });
      setTestResults((prev) => ({ ...prev, egais: result }));
      toast(result.success ? 'УТМ доступен' : result.message, { icon: result.success ? '✓' : 'ℹ' });
    } catch (err) {
      setTestResults((prev) => ({ ...prev, egais: { success: false, message: err.message } }));
      toast.error(err.message);
    }
  };

  const testCZ = async () => {
    try {
      const result = await api.post('/integrations/test-chestniy-znak');
      setTestResults((prev) => ({ ...prev, cz: result }));
      toast(result.success ? 'API доступен' : result.message, { icon: result.success ? '✓' : 'ℹ' });
    } catch (err) {
      setTestResults((prev) => ({ ...prev, cz: { success: false, message: err.message } }));
      toast.error(err.message);
    }
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки интеграций</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      {/* ЕГАИС */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>ЕГАИС (алкоголь)</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.egais_enabled}
              onChange={(e) => setForm({ ...form, egais_enabled: e.target.checked })}
            />
            Включено
          </label>
        </div>

        {form.egais_enabled && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Хост УТМ</label>
                <input
                  className="form-input"
                  value={form.egais_utm_host}
                  onChange={(e) => setForm({ ...form, egais_utm_host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Порт УТМ</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.egais_utm_port}
                  onChange={(e) => setForm({ ...form, egais_utm_port: Number(e.target.value) })}
                  placeholder="8080"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ФСРАР ИД</label>
              <input
                className="form-input"
                value={form.egais_fsrar_id}
                onChange={(e) => setForm({ ...form, egais_fsrar_id: e.target.value })}
                placeholder="Идентификатор организации в ФСРАР"
              />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={testEgais} style={{ marginTop: 8 }}>
              <Wifi size={14} /> Тест подключения
            </button>
            {testResults.egais && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 4, fontSize: 13,
                background: testResults.egais.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResults.egais.success ? 'var(--success)' : 'var(--text-secondary)',
              }}>
                {testResults.egais.success ? <Wifi size={14} /> : <WifiOff size={14} />}
                {' '}{testResults.egais.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* Честный знак */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Честный знак (табак)</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.chestniy_znak_enabled}
              onChange={(e) => setForm({ ...form, chestniy_znak_enabled: e.target.checked })}
            />
            Включено
          </label>
        </div>

        {form.chestniy_znak_enabled && (
          <>
            <div className="form-group">
              <label className="form-label">API токен</label>
              <input
                className="form-input"
                type="password"
                value={form.chestniy_znak_token}
                onChange={(e) => setForm({ ...form, chestniy_znak_token: e.target.value })}
                placeholder="Токен авторизации CRPT API"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">OMS ID</label>
                <input
                  className="form-input"
                  value={form.chestniy_znak_omsid}
                  onChange={(e) => setForm({ ...form, chestniy_znak_omsid: e.target.value })}
                  placeholder="Идентификатор OMS"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Среда</label>
                <select
                  className="form-input"
                  value={form.chestniy_znak_environment}
                  onChange={(e) => setForm({ ...form, chestniy_znak_environment: e.target.value })}
                >
                  <option value="sandbox">Sandbox (тестовая)</option>
                  <option value="production">Production (боевая)</option>
                </select>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={testCZ} style={{ marginTop: 8 }}>
              <Wifi size={14} /> Тест подключения
            </button>
            {testResults.cz && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 4, fontSize: 13,
                background: testResults.cz.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResults.cz.success ? 'var(--success)' : 'var(--text-secondary)',
              }}>
                {testResults.cz.success ? <Wifi size={14} /> : <WifiOff size={14} />}
                {' '}{testResults.cz.message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
