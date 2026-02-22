import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { RefreshCw, Filter } from 'lucide-react';

const STATUS_LABELS = {
  received: 'Принят',
  on_sale: 'В продаже',
  sold: 'Продан',
  written_off: 'Списан',
};

const STATUS_COLORS = {
  received: 'var(--accent)',
  on_sale: 'var(--success)',
  sold: 'var(--text-muted)',
  written_off: 'var(--danger)',
};

const TYPE_LABELS = {
  egais: 'ЕГАИС',
  tobacco: 'Табак',
};

export default function MarkedItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    marking_type: '',
    status: '',
    product_id: '',
  });
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.get('/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.marking_type) params.set('marking_type', filters.marking_type);
      if (filters.status) params.set('status', filters.status);
      if (filters.product_id) params.set('product_id', filters.product_id);
      params.set('limit', '100');

      const data = await api.get(`/marking?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWriteOff = async (item) => {
    if (!confirm(`Списать код ${item.marking_code.substring(0, 30)}...?`)) return;
    try {
      await api.post(`/marking/${item.id}/write-off`);
      toast.success('Списано');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Маркированные товары</h1>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Обновить
        </button>
      </div>

      {/* Фильтры */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="form-label" style={{ fontSize: 12 }}>
              <Filter size={12} /> Тип
            </label>
            <select
              className="form-input"
              value={filters.marking_type}
              onChange={(e) => setFilters({ ...filters, marking_type: e.target.value })}
            >
              <option value="">Все</option>
              <option value="egais">ЕГАИС</option>
              <option value="tobacco">Табак</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="form-label" style={{ fontSize: 12 }}>Статус</label>
            <select
              className="form-input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">Все</option>
              <option value="received">Принят</option>
              <option value="on_sale">В продаже</option>
              <option value="sold">Продан</option>
              <option value="written_off">Списан</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label className="form-label" style={{ fontSize: 12 }}>Товар</label>
            <select
              className="form-input"
              value={filters.product_id}
              onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
            >
              <option value="">Все товары</option>
              {products.filter((p) => p.marking_type && p.marking_type !== 'none').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
        Всего: {total}
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Тип</th>
              <th>Товар</th>
              <th>Статус</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.marking_code.substring(0, 30)}{item.marking_code.length > 30 ? '...' : ''}
                </td>
                <td>
                  <span className="badge badge-warning" style={{ fontSize: 10 }}>
                    {TYPE_LABELS[item.marking_type] || item.marking_type}
                  </span>
                </td>
                <td>{item.product_name || '—'}</td>
                <td>
                  <span style={{ color: STATUS_COLORS[item.status] || 'inherit', fontWeight: 500, fontSize: 13 }}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleString('ru')}</td>
                <td style={{ textAlign: 'right' }}>
                  {(item.status === 'received' || item.status === 'on_sale') && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleWriteOff(item)} style={{ color: 'var(--danger)', fontSize: 12 }}>
                      Списать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
            Нет маркированных единиц
          </div>
        )}
      </div>
    </div>
  );
}
