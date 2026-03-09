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
    edo_enabled: false,
    edo_provider: '',
    edo_sbis_login: '',
    edo_sbis_password: '',
    edo_sbis_app_client_id: '',
    edo_sbis_app_secret: '',
    edo_diadoc_api_key: '',
    edo_diadoc_login: '',
    edo_diadoc_password: '',
    edo_diadoc_box_id: '',
    kkt_enabled: false,
    kkt_provider: '',
    kkt_strict_mode: false,
    kkt_default_vat: 'none',
    kkt_group_code: '',
    kkt_login: '',
    kkt_password: '',
    kkt_inn: '',
    kkt_payment_address: '',
    kkt_sno: '',
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
        edo_enabled: data.edo_enabled || false,
        edo_provider: data.edo_provider || '',
        edo_sbis_login: data.edo_sbis_login || '',
        edo_sbis_password: data.edo_sbis_password || '',
        edo_sbis_app_client_id: data.edo_sbis_app_client_id || '',
        edo_sbis_app_secret: data.edo_sbis_app_secret || '',
        edo_diadoc_api_key: data.edo_diadoc_api_key || '',
        edo_diadoc_login: data.edo_diadoc_login || '',
        edo_diadoc_password: data.edo_diadoc_password || '',
        edo_diadoc_box_id: data.edo_diadoc_box_id || '',
        kkt_enabled: data.kkt_enabled || false,
        kkt_provider: data.kkt_provider || '',
        kkt_strict_mode: data.kkt_strict_mode || false,
        kkt_default_vat: data.kkt_default_vat || 'none',
        kkt_group_code: data.kkt_group_code || '',
        kkt_login: data.kkt_login || '',
        kkt_password: data.kkt_password || '',
        kkt_inn: data.kkt_inn || '',
        kkt_payment_address: data.kkt_payment_address || '',
        kkt_sno: data.kkt_sno || '',
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

  const testEdo = async () => {
    try {
      const result = await api.post('/edo/test-connection');
      setTestResults((prev) => ({ ...prev, edo: result }));
      toast(result.success ? 'Подключение установлено' : result.message, { icon: result.success ? '✓' : 'ℹ' });
    } catch (err) {
      setTestResults((prev) => ({ ...prev, edo: { success: false, message: err.message } }));
      toast.error(err.message);
    }
  };

  const testKkt = async () => {
    try {
      const result = await api.post('/integrations/test-kkt');
      setTestResults((prev) => ({ ...prev, kkt: result }));
      toast(result.success ? 'Подключение к ККТ установлено' : result.message, { icon: result.success ? '✓' : 'ℹ' });
    } catch (err) {
      setTestResults((prev) => ({ ...prev, kkt: { success: false, message: err.message } }));
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

      {/* ЭДО (СБИС / Диадок) */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>ЭДО (электронный документооборот)</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.edo_enabled}
              onChange={(e) => setForm({ ...form, edo_enabled: e.target.checked })}
            />
            Включено
          </label>
        </div>

        {form.edo_enabled && (
          <>
            <div className="form-group">
              <label className="form-label">Провайдер ЭДО</label>
              <select
                className="form-input"
                value={form.edo_provider}
                onChange={(e) => setForm({ ...form, edo_provider: e.target.value })}
              >
                <option value="">Выберите провайдер</option>
                <option value="sbis">СБИС</option>
                <option value="diadoc">Диадок (Контур)</option>
              </select>
            </div>

            {form.edo_provider === 'sbis' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Логин СБИС</label>
                    <input
                      className="form-input"
                      value={form.edo_sbis_login}
                      onChange={(e) => setForm({ ...form, edo_sbis_login: e.target.value })}
                      placeholder="Логин"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Пароль СБИС</label>
                    <input
                      className="form-input"
                      type="password"
                      value={form.edo_sbis_password}
                      onChange={(e) => setForm({ ...form, edo_sbis_password: e.target.value })}
                      placeholder="Пароль"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">App Client ID</label>
                    <input
                      className="form-input"
                      value={form.edo_sbis_app_client_id}
                      onChange={(e) => setForm({ ...form, edo_sbis_app_client_id: e.target.value })}
                      placeholder="Идентификатор приложения"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">App Secret</label>
                    <input
                      className="form-input"
                      type="password"
                      value={form.edo_sbis_app_secret}
                      onChange={(e) => setForm({ ...form, edo_sbis_app_secret: e.target.value })}
                      placeholder="Секрет приложения"
                    />
                  </div>
                </div>
              </>
            )}

            {form.edo_provider === 'diadoc' && (
              <>
                <div className="form-group">
                  <label className="form-label">API ключ Диадок</label>
                  <input
                    className="form-input"
                    type="password"
                    value={form.edo_diadoc_api_key}
                    onChange={(e) => setForm({ ...form, edo_diadoc_api_key: e.target.value })}
                    placeholder="API ключ (получить в ЛК Контур)"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Логин Диадок</label>
                    <input
                      className="form-input"
                      value={form.edo_diadoc_login}
                      onChange={(e) => setForm({ ...form, edo_diadoc_login: e.target.value })}
                      placeholder="Логин"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Пароль Диадок</label>
                    <input
                      className="form-input"
                      type="password"
                      value={form.edo_diadoc_password}
                      onChange={(e) => setForm({ ...form, edo_diadoc_password: e.target.value })}
                      placeholder="Пароль"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Box ID</label>
                  <input
                    className="form-input"
                    value={form.edo_diadoc_box_id}
                    onChange={(e) => setForm({ ...form, edo_diadoc_box_id: e.target.value })}
                    placeholder="Идентификатор ящика (из настроек Диадок)"
                  />
                </div>
              </>
            )}

            {form.edo_provider && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={testEdo} style={{ marginTop: 8 }}>
                  <Wifi size={14} /> Тест подключения
                </button>
                {testResults.edo && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 4, fontSize: 13,
                    background: testResults.edo.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: testResults.edo.success ? 'var(--success)' : 'var(--text-secondary)',
                  }}>
                    {testResults.edo.success ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {' '}{testResults.edo.message}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ККТ (Контрольно-кассовая техника) */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>ККТ (онлайн-касса)</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.kkt_enabled}
              onChange={(e) => setForm({ ...form, kkt_enabled: e.target.checked })}
            />
            Включено
          </label>
        </div>

        {form.kkt_enabled && (
          <>
            <div className="form-group">
              <label className="form-label">Провайдер ККТ</label>
              <select
                className="form-input"
                value={form.kkt_provider}
                onChange={(e) => setForm({ ...form, kkt_provider: e.target.value })}
              >
                <option value="">Выберите провайдер</option>
                <option value="atol">АТОЛ Онлайн</option>
              </select>
            </div>

            {form.kkt_provider === 'atol' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Логин интегратора</label>
                    <input
                      className="form-input"
                      value={form.kkt_login}
                      onChange={(e) => setForm({ ...form, kkt_login: e.target.value })}
                      placeholder="Логин АТОЛ"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Пароль интегратора</label>
                    <input
                      className="form-input"
                      type="password"
                      value={form.kkt_password}
                      onChange={(e) => setForm({ ...form, kkt_password: e.target.value })}
                      placeholder="Пароль АТОЛ"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Код группы (group_code)</label>
                    <input
                      className="form-input"
                      value={form.kkt_group_code}
                      onChange={(e) => setForm({ ...form, kkt_group_code: e.target.value })}
                      placeholder="Код группы ККТ"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ИНН организации</label>
                    <input
                      className="form-input"
                      value={form.kkt_inn}
                      onChange={(e) => setForm({ ...form, kkt_inn: e.target.value })}
                      placeholder="ИНН (10 или 12 цифр)"
                      maxLength={12}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Адрес расчёта</label>
                  <input
                    className="form-input"
                    value={form.kkt_payment_address}
                    onChange={(e) => setForm({ ...form, kkt_payment_address: e.target.value })}
                    placeholder="Адрес, который будет печататься на чеке"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Система налогообложения</label>
                    <select
                      className="form-input"
                      value={form.kkt_sno}
                      onChange={(e) => setForm({ ...form, kkt_sno: e.target.value })}
                    >
                      <option value="">Выберите СНО</option>
                      <option value="osn">ОСН (общая)</option>
                      <option value="usn_income">УСН доходы</option>
                      <option value="usn_income_outcome">УСН доходы-расходы</option>
                      <option value="envd">ЕНВД</option>
                      <option value="esn">ЕСН</option>
                      <option value="patent">Патент</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">НДС по умолчанию</label>
                    <select
                      className="form-input"
                      value={form.kkt_default_vat}
                      onChange={(e) => setForm({ ...form, kkt_default_vat: e.target.value })}
                    >
                      <option value="none">Без НДС</option>
                      <option value="vat0">НДС 0%</option>
                      <option value="vat10">НДС 10%</option>
                      <option value="vat20">НДС 20%</option>
                      <option value="vat110">НДС 10/110</option>
                      <option value="vat120">НДС 20/120</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.kkt_strict_mode}
                  onChange={(e) => setForm({ ...form, kkt_strict_mode: e.target.checked })}
                />
                <span>
                  <strong>Строгий режим</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Если включён, заказ не закроется при ошибке фискализации. Если выключен — заказ закроется, чек попадёт в очередь.
                  </div>
                </span>
              </label>
            </div>

            {form.kkt_provider && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={testKkt} style={{ marginTop: 12 }}>
                  <Wifi size={14} /> Тест подключения
                </button>
                {testResults.kkt && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 4, fontSize: 13,
                    background: testResults.kkt.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: testResults.kkt.success ? 'var(--success)' : 'var(--text-secondary)',
                  }}>
                    {testResults.kkt.success ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {' '}{testResults.kkt.message}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
