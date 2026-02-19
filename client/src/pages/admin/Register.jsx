import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { DoorOpen, DoorClosed, Clock, FileBarChart } from 'lucide-react';
import ShiftReportModal from '../../components/ShiftReportModal';

export default function Register() {
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [openingCash, setOpeningCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedShiftId, setSelectedShiftId] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [d, h] = await Promise.all([api.get('/register/current'), api.get('/register/history')]);
    setDay(d);
    setHistory(h);
    setLoading(false);
  };

  const openDay = async () => {
    try {
      const d = await api.post('/register/open', { opening_cash: Number(openingCash) || 0 });
      setDay(d);
      setOpeningCash('');
      toast.success('Кассовый день открыт');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const closeDay = async () => {
    if (!confirm('Закрыть кассовый день?')) return;
    try {
      await api.post('/register/close', { actual_cash: Number(actualCash) || 0 });
      setDay(null);
      setActualCash('');
      toast.success('Кассовый день закрыт');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Кассовый день</h1>
      </div>

      {!day ? (
        <div className="card" style={{ maxWidth: 400 }}>
          <h3 style={{ marginBottom: 16 }}>Открыть кассовый день</h3>
          <div className="form-group">
            <label className="form-label">Наличные в кассе на начало</label>
            <input className="form-input" type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" />
          </div>
          <button className="btn btn-success" onClick={openDay} style={{ width: '100%' }}>
            <DoorOpen size={16} /> Открыть день
          </button>
        </div>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">Статус</div>
              <div className="stat-value" style={{ color: 'var(--success)', fontSize: 18 }}>Открыт</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {new Date(day.opened_at).toLocaleString('ru')}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Продажи</div>
              <div className="stat-value">{day.total_sales} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Наличные</div>
              <div className="stat-value">{day.total_cash} ₽</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Карта</div>
              <div className="stat-value">{day.total_card} ₽</div>
            </div>
          </div>

          <div className="card" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 16 }}>Закрыть кассовый день</h3>
            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
              Ожидаемые наличные: <strong>{day.expected_cash} ₽</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Фактические наличные в кассе</label>
              <input className="form-input" type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder={day.expected_cash} />
            </div>
            <button className="btn btn-danger" onClick={closeDay} style={{ width: '100%' }}>
              <DoorClosed size={16} /> Закрыть день
            </button>
          </div>
        </>
      )}

      {/* History */}
      <h3 style={{ marginTop: 32, marginBottom: 16 }}>История</h3>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Статус</th>
              <th>Продажи</th>
              <th>Наличные</th>
              <th>Карта</th>
              <th>Расхождение</th>
              <th>Отчёт</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.opened_at).toLocaleDateString('ru')}</td>
                <td>
                  {d.status === 'open'
                    ? <span className="badge badge-success">Открыт</span>
                    : <span className="badge badge-warning">Закрыт</span>
                  }
                </td>
                <td>{d.total_sales} ₽</td>
                <td>{d.total_cash} ₽</td>
                <td>{d.total_card} ₽</td>
                <td>
                  {d.status === 'closed' && d.actual_cash != null
                    ? `${(d.actual_cash - d.expected_cash).toFixed(0)} ₽`
                    : '—'
                  }
                </td>
                <td>
                  <button className="btn-icon" onClick={() => setSelectedShiftId(d.id)} title="Отчёт по смене">
                    <FileBarChart size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет истории</div>}
      </div>

      {selectedShiftId && (
        <ShiftReportModal shiftId={selectedShiftId} onClose={() => setSelectedShiftId(null)} />
      )}
    </div>
  );
}
